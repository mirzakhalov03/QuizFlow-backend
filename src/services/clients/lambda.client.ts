import { LambdaClient } from '@aws-sdk/client-lambda'

const { AWS_REGION } = process.env

if (!AWS_REGION) {
  throw new Error('AWS_REGION is not defined')
}

export const lambdaClient = new LambdaClient({ region: AWS_REGION })
