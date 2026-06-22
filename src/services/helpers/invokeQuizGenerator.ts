import { InvokeCommand, type InvokeCommandOutput } from '@aws-sdk/client-lambda'
import { and, eq } from 'drizzle-orm'

import { db } from '../../database/database'
import { quizJobs, userApiKeys } from '../../database/schema'
import { AppError } from '../../helpers/AppError'
import type { DifficultyType } from '../../types/difficultyTypes'
import type { QuestionType } from '../../types/questionTypes'
import { lambdaClient } from '../clients/lambda.client'

export type QuizGeneratePayload = {
  userId: string
  bucket: string
  keys: string[]
  title?: string
  userInstructions?: string
  isTimerEnabled?: boolean
  timerDuration?: number
  type?: QuestionType
  questionCount?: number
  model?: string
  userBio?: string | null
  difficulty?: DifficultyType
  folderId?: string
  apiKeyId?: string
  optionsPerQuestion?: number
}

const { LAMBDA_QUIZ_GENERATOR_ARN } = process.env

if (!LAMBDA_QUIZ_GENERATOR_ARN) {
  throw new AppError('LAMBDA_QUIZ_GENERATOR_ARN is not defined', 500, 'CONFIG_ERROR')
}

const markJobFailed = (jobId: string, error: string) =>
  db.update(quizJobs).set({ status: 'failed', error }).where(eq(quizJobs.id, jobId))

export const invokeQuizGenerator = async (payload: QuizGeneratePayload) => {
  let apiKeyName: string | null = null
  if (payload.apiKeyId) {
    const keyRow = await db
      .select({ keyName: userApiKeys.keyName })
      .from(userApiKeys)
      .where(and(eq(userApiKeys.id, payload.apiKeyId), eq(userApiKeys.userId, payload.userId)))
      .limit(1)
    apiKeyName = keyRow[0]?.keyName ?? 'Deleted Key'
  }

  const [job] = await db
    .insert(quizJobs)
    .values({
      userId: payload.userId,
      status: 'pending',
      apiKeyId: payload.apiKeyId || null,
      apiKeyName,
    })
    .returning({ id: quizJobs.id })

  const command = new InvokeCommand({
    FunctionName: LAMBDA_QUIZ_GENERATOR_ARN,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({ ...payload, jobId: job.id })),
  })

  console.log('[invokeQuizGenerator] payload:', JSON.stringify({ ...payload, jobId: job.id }))

  let response: InvokeCommandOutput

  try {
    response = await lambdaClient.send(command)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markJobFailed(job.id, `Lambda invocation error: ${message}`)
    throw new AppError(
      `Failed to invoke quiz generator Lambda: ${message}`,
      502,
      'LAMBDA_INVOKE_FAILED',
    )
  }

  if (!response.$metadata?.requestId) {
    await markJobFailed(job.id, 'Lambda invocation returned no requestId')
    throw new AppError('Failed to invoke quiz generator Lambda', 502, 'LAMBDA_INVOKE_FAILED')
  }

  await db
    .update(quizJobs)
    .set({ requestId: response.$metadata.requestId })
    .where(eq(quizJobs.id, job.id))

  return job.id
}
