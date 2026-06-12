import { type NextFunction, type Request, type Response } from 'express'

import { logger } from '../config/logger'
import { errorResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const isOperationalError = err instanceof AppError
  const isProduction = process.env.NODE_ENV === 'production'

  const statusCode = isOperationalError ? err.statusCode : 500
  const message =
    isOperationalError || !isProduction
      ? err instanceof Error
        ? err.message
        : String(err)
      : 'Something went wrong'
  const code = isOperationalError
    ? err.code
    : err instanceof Error && typeof (err as { code?: unknown }).code === 'string'
      ? (err as { code?: string }).code
      : 'INTERNAL_ERROR'

  const log = req.log ?? logger
  log.error(message, {
    code,
    statusCode,
    stack: err instanceof Error ? err.stack : undefined,
  })

  const errorPayload = {
    code,
    details: isOperationalError ? (err.details ?? null) : null,
  }

  if (!isProduction && err instanceof Error) {
    Object.assign(errorPayload, { stack: err.stack ?? null })
  }

  res.status(statusCode).json(errorResponse(message, errorPayload))
}
