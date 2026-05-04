import type { NextFunction, Request, Response } from 'express'
import multer, { MulterError } from 'multer'

import { AppError } from '../helpers/AppError'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../helpers/utils/uploadUtils'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(
        new AppError(
          `Unsupported file type "${file.mimetype}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
          415,
          'UNSUPPORTED_FILE_TYPE',
        ) as unknown as null,
        false,
      )
    }
  },
})

export const handleMulterError = (
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(
          `File size exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`,
          413,
          'FILE_TOO_LARGE',
        ),
      )
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError('Unexpected field name in upload', 400, 'UPLOAD_ERROR'))
    }
    return next(new AppError(err.message, 400, 'UPLOAD_ERROR'))
  }

  return next(err)
}
