import { randomUUID } from 'crypto'

import type { Request, Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { ALLOWED_MIME_TYPES, buildS3Key, getUploadedFiles } from '../helpers/utils/uploadUtils'
import { createPresignedUploadUrl } from '../services/presignedUrl'
import { uploadFile } from '../services/uploadFile'

/**
 * POST /upload-file  (legacy — kept for backward compatibility)
 * Accepts multipart/form-data, buffers the file in server RAM, uploads to S3.
 * @deprecated Prefer GET /upload/presigned-url for direct client-to-S3 uploads.
 */
export const uploadFileController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = getUploadedFiles(req)

    const uploads = await Promise.all(
      files.map((file) =>
        uploadFile(file.buffer, {
          contentType: file.mimetype,
          key: buildS3Key(file),
        }),
      ),
    )

    res.status(201).json(successResponse('Files uploaded successfully', uploads))
  } catch (error) {
    next(error)
  }
}

/**
 * GET /upload/presigned-url
 * Returns a short-lived S3 pre-signed PUT URL.
 * The client uses it to upload directly to S3 — the file never touches this server.
 *
 * Query params:
 *   filename    (string, required) — original filename, used to build the S3 key
 *   contentType (string, required) — MIME type, must be in the allowed list
 */
export const getPresignedUrlController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filename = typeof req.query.filename === 'string' ? req.query.filename.trim() : undefined
    const contentType =
      typeof req.query.contentType === 'string' ? req.query.contentType.trim() : undefined

    if (!filename) {
      throw new AppError('filename query param is required', 400, 'VALIDATION_ERROR')
    }
    if (!contentType) {
      throw new AppError('contentType query param is required', 400, 'VALIDATION_ERROR')
    }
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      throw new AppError(
        `Unsupported file type "${contentType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        415,
        'UNSUPPORTED_FILE_TYPE',
      )
    }

    // Build a server-controlled key — client cannot choose an arbitrary S3 path
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-')
    const key = `uploads/${randomUUID()}-${safeName}`

    const result = await createPresignedUploadUrl(key, contentType)

    res.status(201).json(successResponse('Pre-signed upload URL generated', result))
  } catch (error) {
    next(error)
  }
}
