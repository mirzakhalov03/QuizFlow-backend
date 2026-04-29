import type { NextFunction, Request, Response } from 'express'
import multer, { MulterError } from 'multer'

import { AppError } from '../helpers/AppError'
import { MAX_FILE_SIZE_BYTES } from '../helpers/utils/uploadUtils'

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
})

export const handleMulterError = (
  err: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('File size exceeds 25MB limit', 413, 'FILE_TOO_LARGE'))
    }

    return next(new AppError(err.message, 400, 'UPLOAD_ERROR'))
  }

  return next(err)
}
