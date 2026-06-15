import type { Readable } from 'stream'

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'

import { getLambdaDb } from './dbClient'
import { s3Client } from './s3Client'
import { questionOptions, questions, quizJobs, quizzes } from '../database/schema'
import {
  extractTextFromBuffer,
  normalizeQuestionType,
  QUIZ_FILE_MAX_BYTES,
  streamToBuffer,
} from '../helpers/utils/quizLambdaUtils'
import { getByokById } from '../services/byok.service'
import { generateQuizFromText } from '../services/helpers/quizAi'
import type { AiQuiz, AiQuizResult } from '../services/helpers/quizAi'
import type { DifficultyType } from '../types/difficultyTypes'
import type { QuestionType } from '../types/questionTypes'
// Lambda-local clients — no Express app dependencies, no credential env vars required

type LambdaEvent = {
  jobId: string
  bucket: string
  key?: string
  keys?: string[]
  userId: string
  title?: string
  userInstructions?: string
  isTimerEnabled?: boolean
  timerDuration?: number
  type?: string
  questionCount?: number
  model?: string
  quiz?: AiQuiz
  userBio?: string | null
  difficulty?: DifficultyType
  folderId?: string
  apiKeyId?: string
}

const persistQuiz = async (
  result: AiQuizResult,
  event: LambdaEvent,
  source: { bucket: string; key: string },
) => {
  const db = await getLambdaDb()

  const { quiz: payload, usage = null } = result

  const questionsList = Array.isArray(payload.questions) ? payload.questions : []

  const quizInsert = await db.transaction(async (tx) => {
    // ── Insert 1: quiz row ──────────────────────────────────────────────────
    const [quizRow] = await tx
      .insert(quizzes)
      .values({
        title: payload.title || event.title || 'Untitled quiz',
        userId: event.userId,
        folderId: event.folderId,
        type: event.type ? normalizeQuestionType(event.type) : undefined,
        properties: {
          source,
          generatedBy: 'openrouter',
        },
        isTimerEnabled: Boolean(event.isTimerEnabled),
        timerDuration: event.isTimerEnabled ? (event.timerDuration ?? null) : null,
        userInstructions: event.userInstructions ?? null,
        tokenUsage: usage,
        uploadedAt: new Date(),
        difficulty: event.difficulty,
      })
      .returning({ id: quizzes.id })

    if (questionsList.length === 0) return quizRow

    // ── Insert 2: all questions in a single statement ───────────────────────
    // Drizzle guarantees .returning() rows are in the same order as .values(),
    // so questionRows[i].id safely corresponds to questionsList[i].
    const questionRows = await tx
      .insert(questions)
      .values(
        questionsList.map((question, index) => ({
          quizId: quizRow.id,
          text: question.text,
          type: normalizeQuestionType(question.type) as QuestionType,
          position: index + 1,
        })),
      )
      .returning({ id: questions.id })

    // ── Insert 3: all options for all questions in a single statement ────────
    const allOptionValues = questionsList.flatMap((question, index) => {
      const options = Array.isArray(question.options) ? question.options : []
      return options.map((option, optionIndex) => ({
        questionId: questionRows[index].id,
        text: option.text,
        explanation: option.explanation ?? null,
        isCorrect: Boolean(option.isCorrect),
        position: optionIndex + 1,
      }))
    })

    if (allOptionValues.length > 0) {
      await tx.insert(questionOptions).values(allOptionValues)
    }

    return quizRow
  })

  return quizInsert
}

const fetchSourceText = async (bucket: string, key: string): Promise<string> => {
  const s3Response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

  if (!s3Response.Body) {
    throw new Error('S3 object has no body')
  }

  const buffer = await streamToBuffer(s3Response.Body as Readable, QUIZ_FILE_MAX_BYTES)
  return extractTextFromBuffer(buffer, s3Response.ContentType ?? '', key)
}

export const handler = async (event: LambdaEvent) => {
  const allKeys = event.keys?.length ? event.keys : event.key ? [event.key] : []
  if (!event?.bucket || allKeys.length === 0 || !event?.userId || !event?.jobId) {
    throw new Error('bucket, key/keys, userId, and jobId are required')
  }

  const db = await getLambdaDb()

  try {
    const sourceTexts = await Promise.all(allKeys.map((k) => fetchSourceText(event.bucket, k)))
    const sourceText = sourceTexts.join('\n\n---\n\n')

    let apiKey
    if (event.apiKeyId) apiKey = await getByokById(event.apiKeyId, event.userId, db)

    const result = event.quiz
      ? { quiz: event.quiz }
      : await generateQuizFromText({
          sourceText,
          questionCount: event.questionCount,
          type: event.type ? (normalizeQuestionType(event.type) as QuestionType) : undefined,
          userInstructions: event.userInstructions,
          userBio: event.userBio,
          defaultTitle: event.title,
          model: event.model,
          difficulty: event.difficulty,
          apiKey,
        })

    const quizRow = await persistQuiz(result, event, {
      bucket: event.bucket,
      key: allKeys[0],
    })

    // Update job → done
    await db
      .update(quizJobs)
      .set({ status: 'done', quizId: quizRow.id, tokensUsed: result.usage })
      .where(eq(quizJobs.id, event.jobId))

    const quizData = result.quiz

    return {
      statusCode: 200,
      quizId: quizRow.id,
      questionCount: quizData.questions.length,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[quizGenerator] Failed:', message, err)

    // Update job → failed with error message
    await db
      .update(quizJobs)
      .set({ status: 'failed', error: message })
      .where(eq(quizJobs.id, event.jobId))

    throw err
  }
}
