import { S3Client } from '@aws-sdk/client-s3'

import { AppError } from '../../helpers/AppError'

const { AWS_REGION, AWS_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env

const missing = [
  'AWS_REGION',
  'AWS_BUCKET_NAME',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
].filter((key) => !process.env[key])
if (missing.length > 0) {
  throw new AppError(
    `Missing required environment variables: ${missing.join(', ')}`,
    500,
    'CONFIG_ERROR',
  )
}

export const s3Region = AWS_REGION as string
export const s3BucketName = AWS_BUCKET_NAME as string

export const s3Client = new S3Client({
  region: s3Region,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID as string,
    secretAccessKey: AWS_SECRET_ACCESS_KEY as string,
  },
})
