import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import {
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdated,
} from '@aws-sdk/client-lambda'
import AdmZip from 'adm-zip'
import 'dotenv/config'

async function deploy() {
  const functionName = process.env.LAMBDA_QUIZ_GENERATOR_ARN
  const region = process.env.AWS_REGION

  if (!functionName) {
    console.error('Error: LAMBDA_QUIZ_GENERATOR_ARN is not defined in .env')
    process.exit(1)
  }

  if (!region) {
    console.error('Error: AWS_REGION is not defined in .env')
    process.exit(1)
  }

  const client = new LambdaClient({ region })

  try {
    // 1. Build the Lambda
    console.log('Step 1: Building Lambda...')
    execSync('npm run build:lambda', { stdio: 'inherit' })

    // 2. Zip the output
    console.log('Step 2: Zipping Lambda...')
    const zip = new AdmZip()
    const buildPath = path.join(__dirname, '../dist/lambda/index.js')

    if (!fs.existsSync(buildPath)) {
      throw new Error(`Build file not found at ${buildPath}`)
    }

    // Lambda expects the entry file to be at the root of the zip
    zip.addLocalFile(buildPath)
    const zipBuffer = zip.toBuffer()
    console.log(`Zip created. Size: ${(zipBuffer.length / 1024).toFixed(2)} KB`)

    // 3. Update Lambda code
    console.log(`Step 3: Updating Lambda code for ${functionName}...`)
    const updateCodeCommand = new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      ZipFile: zipBuffer,
    })

    const codeResponse = await client.send(updateCodeCommand)
    console.log('Lambda code updated successfully.')
    console.log('Waiting for Lambda update to finish...')

    await waitUntilFunctionUpdated(
      {
        client,
        maxWaitTime: 120, // seconds
      },
      {
        FunctionName: functionName,
      },
    )

    console.log('Lambda update completed.')

    // 4. Update Lambda configuration (Environment Variables)
    console.log('Step 4: Syncing environment variables to Lambda...')

    // Define which variables should be synced to the Lambda
    const variablesToSync = [
      'OPENROUTER_API_KEY',
      'DATABASE_URL',
      'DATABASE_SSL',
      'APP_URL',
      'AWS_BUCKET_NAME',
    ]

    const Variables: Record<string, string> = {}
    for (const key of variablesToSync) {
      if (process.env[key]) {
        Variables[key] = process.env[key] as string
      }
    }

    if (Object.keys(Variables).length > 0) {
      const updateConfigCommand = new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Environment: {
          Variables,
        },
      })

      await client.send(updateConfigCommand)
      console.log('Lambda environment variables synced successfully.')
      console.log('Waiting for Lambda update to finish...')

      await waitUntilFunctionUpdated(
        {
          client,
          maxWaitTime: 120, // seconds
        },
        {
          FunctionName: functionName,
        },
      )

      console.log('Lambda update completed.')
      console.log('Synced variables:', Object.keys(Variables).join(', '))
    } else {
      console.log('No environment variables to sync.')
    }

    console.log('\nSUCCESS! Deployment complete.')
    console.log(`Function ARN: ${codeResponse.FunctionArn}`)
    console.log(`Last Modified: ${codeResponse.LastModified}`)
  } catch (error) {
    console.error('\nDeployment failed:')
    console.error(error)
    process.exit(1)
  }
}

deploy()
