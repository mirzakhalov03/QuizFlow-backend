import rateLimit from 'express-rate-limit'

import type { AuthRequest } from './authMiddleware'
import { AppError } from '../helpers/AppError'

export const quizGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? req.ip ?? 'anonymous',
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'Too many quiz generation requests, please try again later.',
        429,
        'RATE_LIMITED',
      ),
    )
  },
})
