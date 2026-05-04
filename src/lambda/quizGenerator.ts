import type { Readable } from 'stream'

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'

import { getLambdaDb } from './dbClient'
import { s3Client } from './s3Client'
import { questionOptions, questions, quizJobs, quizzes } from '../database/schema'
import {
  normalizeQuestionType,
  QUIZ_FILE_MAX_BYTES,
  streamToString,
} from '../helpers/utils/quizLambdaUtils'
import { generateQuizFromText } from '../services/quizAi'
import type { AiQuiz } from '../services/quizAi'
import type { QuestionType } from '../types/questionTypes'

// Lambda-local clients — no Express app dependencies, no credential env vars required

type LambdaEvent = {
  jobId: string
  bucket: string
  key: string
  userId: string
  title?: string
  userInstructions?: string
  isTimerEnabled?: boolean
  timerDuration?: number
  type?: string
  questionCount?: number
  quiz?: AiQuiz
}

const persistQuiz = async (
  payload: AiQuiz,
  event: LambdaEvent,
  source: { bucket: string; key: string },
) => {
  const db = await getLambdaDb()
  const questionsList = Array.isArray(payload.questions) ? payload.questions : []

  const quizInsert = await db.transaction(async (tx) => {
    const [quizRow] = await tx
      .insert(quizzes)
      .values({
        title: payload.title || event.title || 'Untitled quiz',
        userId: event.userId,
        type: event.type ? normalizeQuestionType(event.type) : undefined,
        properties: {
          source,
          generatedBy: 'openrouter',
        },
        isTimerEnabled: Boolean(event.isTimerEnabled),
        timerDuration: event.isTimerEnabled ? (event.timerDuration ?? null) : null,
        userInstructions: event.userInstructions ?? null,
        uploadedAt: new Date(),
      })
      .returning({ id: quizzes.id })

    for (const [index, question] of questionsList.entries()) {
      const questionType = normalizeQuestionType(question.type) as QuestionType

      const [questionRow] = await tx
        .insert(questions)
        .values({
          quizId: quizRow.id,
          text: question.text,
          type: questionType,
          position: index + 1,
        })
        .returning({ id: questions.id })

      const options = Array.isArray(question.options) ? question.options : []
      if (options.length === 0) {
        continue
      }

      const optionRows = options.map((option, optionIndex) => ({
        questionId: questionRow.id,
        text: option.text,
        explanation: option.explanation ?? null,
        isCorrect: Boolean(option.isCorrect),
        position: optionIndex + 1,
      }))

      await tx.insert(questionOptions).values(optionRows)
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

  return streamToString(s3Response.Body as Readable, QUIZ_FILE_MAX_BYTES)
}

export const handler = async (event: LambdaEvent) => {
  if (!event?.bucket || !event?.key || !event?.userId || !event?.jobId) {
    throw new Error('bucket, key, userId, and jobId are required')
  }

  const db = await getLambdaDb()

  try {
    const quiz =
      event.quiz ??
      (await generateQuizFromText({
        sourceText: await fetchSourceText(event.bucket, event.key),
        questionCount: event.questionCount,
        type: event.type ? (normalizeQuestionType(event.type) as QuestionType) : undefined,
        userInstructions: event.userInstructions,
        defaultTitle: event.title,
      }))

    const quizRow = await persistQuiz(quiz, event, {
      bucket: event.bucket,
      key: event.key,
    })

    // Update job → done
    await db
      .update(quizJobs)
      .set({ status: 'done', quizId: quizRow.id })
      .where(eq(quizJobs.id, event.jobId))

    return {
      statusCode: 200,
      quizId: quizRow.id,
      questionCount: quiz.questions.length,
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
