import type { Readable } from 'stream'

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { db } from '../database/database'
import { questionOptions, questions, quizzes } from '../database/schema'
import {
  normalizeQuestionType,
  QUIZ_FILE_MAX_BYTES,
  streamToString,
} from '../helpers/utils/quizLambdaUtils'
import { generateQuizFromText } from '../services/quizAi'
import type { AiQuiz } from '../services/quizAi'
import type { QuestionType } from '../types/questionTypes'

const { AWS_REGION } = process.env

type LambdaEvent = {
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

if (!AWS_REGION) {
  throw new Error('AWS_REGION is not defined')
}

const s3Client = new S3Client({ region: AWS_REGION })

const persistQuiz = async (
  payload: AiQuiz,
  event: LambdaEvent,
  source: { bucket: string; key: string },
) => {
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

export const handler = async (event: LambdaEvent) => {
  if (!event?.bucket || !event?.key || !event?.userId) {
    throw new Error('bucket, key, and userId are required')
  }

  const s3Response = await s3Client.send(
    new GetObjectCommand({
      Bucket: event.bucket,
      Key: event.key,
    }),
  )

  if (!s3Response.Body) {
    throw new Error('S3 object has no body')
  }

  const maxBytes = QUIZ_FILE_MAX_BYTES ? Number(QUIZ_FILE_MAX_BYTES) : 5 * 1024 * 1024
  if (Number.isNaN(maxBytes) || maxBytes <= 0) {
    throw new Error('QUIZ_FILE_MAX_BYTES must be a positive number')
  }

  const content = await streamToString(s3Response.Body as Readable, maxBytes)

  const quiz =
    event.quiz ??
    (await generateQuizFromText({
      sourceText: content,
      questionCount: event.questionCount,
      type: event.type ? (normalizeQuestionType(event.type) as QuestionType) : undefined,
      userInstructions: event.userInstructions,
      defaultTitle: event.title,
    }))

  const quizRow = await persistQuiz(quiz, event, {
    bucket: event.bucket,
    key: event.key,
  })

  return {
    statusCode: 200,
    quizId: quizRow.id,
    questionCount: quiz.questions.length,
  }
}
