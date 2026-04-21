import { type NextFunction, type Request, type Response } from 'express'

import { errorResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const isOperationalError = err instanceof AppError

  const statusCode = isOperationalError ? err.statusCode : 500
  const message = isOperationalError ? err.message : 'Something went wrong'
  const code = isOperationalError ? err.code : 'INTERNAL_ERROR'

  const errorPayload = {
    code,
    details: isOperationalError ? (err.details ?? null) : null,
  }

  if (process.env.NODE_ENV !== 'production' && !isOperationalError && err instanceof Error) {
    Object.assign(errorPayload, { stack: err.stack ?? null })
  }

  res.status(statusCode).json(errorResponse(message, errorPayload))
}
