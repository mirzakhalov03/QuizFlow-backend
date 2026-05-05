import type { Request } from 'express'

import type { AuthRequest } from '../../middlewares/authMiddleware'
import { AppError } from '../AppError'

export const getAuthUserId = (req: Request): string => {
  const userId = (req as AuthRequest).user?.id
  if (!userId) throw new AppError('Not authenticated', 401, 'UNAUTHORIZED')
  return userId
}
