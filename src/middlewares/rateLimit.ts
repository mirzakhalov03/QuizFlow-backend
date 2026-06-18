import type { Request, Response, NextFunction } from 'express'
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
  keyGenerator: (req) =>
    (req as AuthRequest).user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'anonymous'),
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

const buildAuthHandler = () => (_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Too many attempts, please try again later.', 429, 'RATE_LIMITED'))
}

// Broad protection on credential / OTP-issuance endpoints. Keyed by IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : 'anonymous'),
  handler: buildAuthHandler(),
})

// Tighter protection on code/token verification (brute-force targets).
// Keyed by IP + identifier (email from body, else authenticated userId).
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ipKey = req.ip ? ipKeyGenerator(req.ip) : 'anonymous'
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : undefined
    const identifier = email ?? (req as AuthRequest).user?.id ?? ''
    return `${ipKey}:${identifier}`
  },
  handler: buildAuthHandler(),
})
