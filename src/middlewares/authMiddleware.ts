import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

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

    next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}
