import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

type AuthUser = {
  id: string
  email?: string
}

export type AuthRequest = Request & {
  user?: AuthUser
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.accessToken

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser

    req.user = decoded

    next()
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}
