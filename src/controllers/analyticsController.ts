import type { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { getAuthUserId } from '../helpers/utils/authUtils'
import { getAnalyticsSummary } from '../services/analytics.service'

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
