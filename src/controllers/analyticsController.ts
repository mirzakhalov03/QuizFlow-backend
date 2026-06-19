import type { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { getAuthUserId } from '../helpers/utils/authUtils'
import { getAnalyticsSummary } from '../services/analytics.service'
import { getQuizHistory } from '../services/history.service'
import { HistoryQuerySchema } from '../validators/history.schema'

export const getAnalyticsSummaryController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = getAuthUserId(req)
    const summary = await getAnalyticsSummary(userId)
    res.status(200).json(successResponse('Analytics summary retrieved', summary))
  } catch (error) {
    next(error)
  }
}

export const getQuizHistoryController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const parsed = HistoryQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, 400, 'VALIDATION_ERROR')
    }
    const history = await getQuizHistory(userId, parsed.data)
    res.status(200).json(successResponse('Quiz history retrieved', history))
  } catch (error) {
    next(error)
  }
}
