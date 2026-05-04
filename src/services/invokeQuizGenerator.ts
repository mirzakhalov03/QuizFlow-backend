import { InvokeCommand, type InvokeCommandOutput } from '@aws-sdk/client-lambda'
import { eq } from 'drizzle-orm'

import { lambdaClient } from './lambdaClient'
import { db } from '../database/database'
import { quizJobs } from '../database/schema'
import { AppError } from '../helpers/AppError'
import type { QuestionType } from '../types/questionTypes'

type QuizGeneratePayload = {
  userId: string
  bucket: string
  key: string
  title?: string
  userInstructions?: string
  isTimerEnabled?: boolean
  timerDuration?: number
  type?: QuestionType
}

const { LAMBDA_QUIZ_GENERATOR_ARN } = process.env

if (!LAMBDA_QUIZ_GENERATOR_ARN) {
  throw new AppError('LAMBDA_QUIZ_GENERATOR_ARN is not defined', 500, 'CONFIG_ERROR')
}

const markJobFailed = (jobId: string, error: string) =>
  db.update(quizJobs).set({ status: 'failed', error }).where(eq(quizJobs.id, jobId))

export const invokeQuizGenerator = async (payload: QuizGeneratePayload) => {
  // 1. Create a job record in DB so the client can poll for it
  const [job] = await db
    .insert(quizJobs)
    .values({ userId: payload.userId, status: 'pending' })
    .returning({ id: quizJobs.id })

  // 2. Fire the Lambda asynchronously — pass jobId so the handler can update the record
  const command = new InvokeCommand({
    FunctionName: LAMBDA_QUIZ_GENERATOR_ARN,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({ ...payload, jobId: job.id })),
  })

  let response: InvokeCommandOutput

  try {
    response = await lambdaClient.send(command)
  } catch (err) {
    // Network failure, IAM permission error, AWS unavailability, etc.
    // Mark job failed immediately so the polling client gets actionable feedback.
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

  // Store the AWS requestId for traceability
  await db
    .update(quizJobs)
    .set({ requestId: response.$metadata.requestId })
    .where(eq(quizJobs.id, job.id))

  return job.id
}
