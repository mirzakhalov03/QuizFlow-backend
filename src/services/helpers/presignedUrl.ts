import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { AppError } from '../../helpers/AppError'
import { buildS3ObjectUrl } from '../../helpers/utils/uploadUtils'
import { s3BucketName, s3Region } from '../clients/s3.client'

// SDK v3 adds CRC32 checksums by default — browser fetch can't compute them.
// This client disables automatic checksum injection so the presigned URL stays browser-safe.
const presignClient = new S3Client({
  region: s3Region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
})

/** Pre-signed URL is valid for 5 minutes. Short enough to prevent sharing, long enough for any upload. */
const PRESIGNED_URL_EXPIRES_IN_SECONDS = 300

type PresignedUploadResult = {
  /** S3 key — pass this to POST /quizzes */
  key: string
  /** Pre-signed PUT URL — client uploads directly to S3 with this */
  uploadUrl: string
  /** Public object URL — available only after the upload completes */
  objectUrl: string
  /** ISO timestamp when the pre-signed URL expires */
  expiresAt: string
}

export const createPresignedUploadUrl = async (
  key: string,
  contentType: string,
): Promise<PresignedUploadResult> => {
  const command = new PutObjectCommand({
    Bucket: s3BucketName,
    Key: key,
    ContentType: contentType,
    // Enforce that the client must send the exact ContentType declared.
    // S3 rejects PUTs whose Content-Type header doesn't match — prevents MIME type switching.
  })

  let uploadUrl: string
  try {
    uploadUrl = await getSignedUrl(presignClient, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
    })
  } catch (err) {
    throw new AppError('Failed to generate pre-signed upload URL', 500, 'PRESIGN_FAILED', err)
  }

  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRES_IN_SECONDS * 1000).toISOString()
  const objectUrl = buildS3ObjectUrl(s3BucketName, s3Region, key)

  return { key, uploadUrl, objectUrl, expiresAt }
}
