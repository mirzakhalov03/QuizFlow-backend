import { randomUUID } from 'crypto'

import type { Request, Response, NextFunction } from 'express'

import { logger } from '../config/logger'

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID()
  req.requestId = requestId
  req.log = logger.child({ requestId })
  res.setHeader('x-request-id', requestId)
  next()
}
