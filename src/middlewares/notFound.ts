import { type Request, type Response, type NextFunction } from 'express'

import { AppError } from '../helpers/AppError'

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'))
}
