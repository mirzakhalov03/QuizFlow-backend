import type { Readable } from 'stream'

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { db } from '../database/database'
import { questionOptions, questions, quizzes } from '../database/schema'
import {
  normalizeCorrectList,
  normalizeQuestionType,
  QUIZ_FILE_MAX_BYTES,
  streamToString,
} from '../helpers/utils/quizLambdaUtils'
import type { QuestionType } from '../types/questionTypes'

const { AWS_REGION } = process.env

type QuizQuestion = {
  type: QuestionType
  text: string
  options?: string[]
  correct?: string | string[]
}

type QuizPayload = {
  id: string
  title: string
  questions: QuizQuestion[]
  metadata: {
    purpose?: string
    duration_est?: number
  }
  created_at: string
}

type LambdaEvent = {
  bucket: string
  key: string
  userId: string
  title?: string
  userInstructions?: string
  isTimerEnabled?: boolean
  timerDuration?: number
  type?: string
  quiz?: QuizPayload
}

if (!AWS_REGION) {
  throw new Error('AWS_REGION is not defined')
}

const s3Client = new S3Client({ region: AWS_REGION })

const persistQuiz = async (
  payload: QuizPayload,
  event: LambdaEvent,
  source: { bucket: string; key: string },
) => {
  const metadata = payload.metadata ?? {}
  const questionsList = Array.isArray(payload.questions) ? payload.questions : []

  const quizInsert = await db.transaction(async (tx) => {
    const [quizRow] = await tx
      .insert(quizzes)
      .values({
        title: payload.title || event.title || 'Untitled quiz',
        userId: event.userId,
        type: event.type ? normalizeQuestionType(event.type) : undefined,
        properties: {
          metadata,
          source,
        },
        isTimerEnabled: Boolean(event.isTimerEnabled),
        timerDuration: event.isTimerEnabled ? (event.timerDuration ?? null) : null,
        userInstructions: event.userInstructions ?? null,
        uploadedAt: new Date(),
      })
      .returning({ id: quizzes.id })

    for (const [index, question] of questionsList.entries()) {
      const [questionRow] = await tx
        .insert(questions)
        .values({
          quizId: quizRow.id,
          text: question.text,
          type: normalizeQuestionType(question.type),
          position: index + 1,
        })
        .returning({ id: questions.id })

      const options = question.options ?? []
      if (options.length === 0) {
        continue
      }

      const correctList = normalizeCorrectList(question.correct)

      const optionRows = options.map((optionText, optionIndex) => ({
        questionId: questionRow.id,
        text: optionText,
        explanation: null,
        isCorrect: correctList.includes(optionText.trim()),
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
  if (event.quiz) {
    const quizRow = await persistQuiz(event.quiz, event, {
      bucket: event.bucket,
      key: event.key,
    })

    return {
      statusCode: 200,
      quizId: quizRow.id,
      quiz: event.quiz,
    }
  }

  return {
    statusCode: 200,
    source: { bucket: event.bucket, key: event.key },
    contentLength: content.length,
    contentSample: content.slice(0, 1000),
  }
}
