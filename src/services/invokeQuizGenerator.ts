import { InvokeCommand } from '@aws-sdk/client-lambda'

import { lambdaClient } from './lambdaClient'
import { AppError } from '../helpers/AppError'
import type { QuestionType } from '../types/questionTypes'

type QuizGeneratePayload = {
  bucket: string
  key: string
  userId: string
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

export const invokeQuizGenerator = async (payload: QuizGeneratePayload) => {
  const command = new InvokeCommand({
    FunctionName: LAMBDA_QUIZ_GENERATOR_ARN,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify(payload)),
  })

  const response = await lambdaClient.send(command)

  if (!response.$metadata?.requestId) {
    throw new AppError('Failed to invoke quiz generator Lambda', 502, 'LAMBDA_INVOKE_FAILED')
  }

  return response.$metadata.requestId
}
