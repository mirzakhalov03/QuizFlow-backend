import { randomUUID } from 'crypto'
import { Readable } from 'stream'

import { PutObjectCommand } from '@aws-sdk/client-s3'

import { AppError } from '../../helpers/AppError'
import { buildS3ObjectUrl, isReadableStream } from '../../helpers/utils/uploadUtils'
import { s3BucketName, s3Client, s3Region } from '../clients/s3.client'

type UploadOptions = {
  key?: string
  contentType?: string
}

export const uploadFile = async (file: Buffer | Readable, options: UploadOptions = {}) => {
  if (!file) {
    throw new AppError('File is required', 400, 'VALIDATION_ERROR')
  }

  if (!Buffer.isBuffer(file) && !isReadableStream(file)) {
    throw new AppError('File must be a Buffer or readable stream', 400, 'VALIDATION_ERROR')
  }

  const key = options.key ?? `uploads/${randomUUID()}`

  const command = new PutObjectCommand({
    Bucket: s3BucketName,
    Key: key,
    Body: file,
    ContentType: options.contentType,
  })

  try {
    await s3Client.send(command)
  } catch (error) {
    throw new AppError('Failed to upload file to S3', 500, 'S3_UPLOAD_FAILED', error)
  }

  const url = buildS3ObjectUrl(s3BucketName, s3Region, key)

  return { key, url }
}
