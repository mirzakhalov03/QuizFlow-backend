import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { s3BucketName, s3Client, s3Region } from './s3Client'
import { AppError } from '../helpers/AppError'
import { buildS3ObjectUrl } from '../helpers/utils/uploadUtils'

/** Pre-signed URL is valid for 5 minutes. Short enough to prevent sharing, long enough for any upload. */
const PRESIGNED_URL_EXPIRES_IN_SECONDS = 300

type PresignedUploadResult = {
  /** S3 key — pass this to POST /quizzes/generate */
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
    uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRES_IN_SECONDS,
    })
  } catch (err) {
    throw new AppError('Failed to generate pre-signed upload URL', 500, 'PRESIGN_FAILED', err)
  }

  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRES_IN_SECONDS * 1000).toISOString()
  const objectUrl = buildS3ObjectUrl(s3BucketName, s3Region, key)

  return { key, uploadUrl, objectUrl, expiresAt }
}
