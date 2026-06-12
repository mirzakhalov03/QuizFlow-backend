import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

import type { AuthRequest } from './authMiddleware'
import { AppError } from '../helpers/AppError'

export const quizGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Key by authenticated userId; fall back to a normalized IP key (the helper
  // collapses IPv6 ranges so users can't bypass the limit by cycling addresses).
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? ipKeyGenerator(req.ip ?? 'anonymous'),
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
