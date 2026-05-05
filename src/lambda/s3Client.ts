import { S3Client } from '@aws-sdk/client-s3'

/**
 * Lambda-local S3 client.
 *
 * Does NOT require AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY as env vars.
 * Credentials are provided automatically by the Lambda IAM execution role
 * via the AWS SDK credential provider chain.
 *
 * Required IAM permissions on the execution role:
 *   - s3:GetObject on the source bucket/prefix
 */
const region = process.env.AWS_REGION

if (!region) {
  throw new Error('AWS_REGION is not defined')
}

export const s3Client = new S3Client({ region })
