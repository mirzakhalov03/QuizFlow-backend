import * as Sentry from '@sentry/node'
import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

import { logger } from '../config/logger'
import User from '../models/user.model'

type AuthTokenPayload = {
  id: string
}

type AuthUser = {
  id: string
  email: string
  fullName: string
  hasPassword: boolean
}

export type AuthRequest = Request & {
  user?: AuthUser
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.accessToken

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as AuthTokenPayload

    const user = await User.findById(decoded.id)

    if (!user) {
      return res.status(401).json({ message: 'User not found' })
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      hasPassword: user.password !== null,
    }

    req.log = (req.log ?? logger).child({ userId: user.id })

    Sentry.setUser({
      id: user.id,
      email: user.email,
    })

    next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

/**
 * Like authMiddleware but never rejects: if a valid access token is present it
 * populates req.user, otherwise it silently continues as an anonymous request.
 * Used on routes that are public but behave differently for the resource owner
 * (e.g. the public quiz view, which redirects the owner to their own copy).
 */
export const optionalAuthMiddleware = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.cookies.accessToken
    if (!token) return next()

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as AuthTokenPayload
    const user = await User.findById(decoded.id)

    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        hasPassword: user.password !== null,
      }
      req.log = (req.log ?? logger).child({ userId: user.id })
    }
  } catch {
    // Invalid/expired token on an optional route — treat as anonymous.
  }
  next()
}
