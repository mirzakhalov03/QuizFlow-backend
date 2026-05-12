// @ts-check
// One-off script: updates the Lambda's environment variables.
// Safe to run multiple times — merges with existing env vars, doesn't replace them.

require('dotenv').config()

const {
  LambdaClient,
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
} = require('@aws-sdk/client-lambda')

const client = new LambdaClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const FUNCTION_NAME = process.env.LAMBDA_QUIZ_GENERATOR_ARN

const UPDATES = {
  OPENROUTER_MODEL: 'google/gemini-2.0-flash-001',
}

async function run() {
  const config = await client.send(
    new GetFunctionConfigurationCommand({ FunctionName: FUNCTION_NAME }),
  )

  const current = config.Environment?.Variables ?? {}
  const merged = { ...current, ...UPDATES }

  console.log('Updating Lambda environment variables:')
  Object.entries(UPDATES).forEach(([k, v]) => console.log(`  ${k} = ${v}`))

  await client.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: FUNCTION_NAME,
      Environment: { Variables: merged },
    }),
  )

  console.log('Done.')
}

run().catch((err) => {
  console.error('Error:', err.message ?? err)
  process.exit(1)
})
