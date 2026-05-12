// @ts-check
// One-off script: removes the VPC config from the quiz-generator Lambda
// so it gets default internet access (can reach S3 + OpenRouter).
// Run with: node scripts/remove-lambda-vpc.js

require('dotenv').config()

const {
  LambdaClient,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
} = require('@aws-sdk/client-lambda')

const FUNCTION_NAME = process.env.LAMBDA_QUIZ_GENERATOR_ARN

const client = new LambdaClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

async function run() {
  console.log('Fetching Lambda config for:', FUNCTION_NAME)

  const config = await client.send(
    new GetFunctionConfigurationCommand({ FunctionName: FUNCTION_NAME }),
  )
  const vpc = config.VpcConfig

  if (!vpc?.VpcId) {
    console.log('Lambda is already not in a VPC. Nothing to do.')
    return
  }

  console.log(`Currently in VPC: ${vpc.VpcId}`)
  console.log(`Subnets: ${vpc.SubnetIds?.join(', ')}`)
  console.log(`Security Groups: ${vpc.SecurityGroupIds?.join(', ')}`)
  console.log('\nRemoving VPC config...')

  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      VpcConfig: {
        SubnetIds: [],
        SecurityGroupIds: [],
      },
    }),
  )

  console.log('Done. Lambda VPC config removed.')
  console.log('Wait ~30s for the change to propagate before testing again.')
}

run().catch((err) => {
  console.error('Error:', err.message ?? err)
  process.exit(1)
})
