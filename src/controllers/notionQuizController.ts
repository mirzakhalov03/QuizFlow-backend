import { Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { AuthRequest } from '../middlewares/authMiddleware'
import notionQuizService from '../services/notionQuizService'
import notionService from '../services/notionService'

export const getNotionPages = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id

    const pages = await notionService.getAccessiblePages(userId)

    return res.status(200).json(
      successResponse('Accessible Notion pages retrieved', {
        pages,
      }),
    )
  } catch (error) {
    next(error)
  }
}

export const generateQuizFromNotion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user!.id

    const { pageId, title, userInstructions, isTimerEnabled, timerDuration, type, questionCount } =
      req.body

    if (!pageId) {
      throw new AppError('pageId is required', 400, 'VALIDATION_ERROR')
    }

    const result = await notionQuizService.generateQuizFromNotionPage({
      userId,
      pageId,
      title,
      userInstructions,
      isTimerEnabled: Boolean(isTimerEnabled),
      timerDuration,
      type,
      questionCount,
    })

    return res.status(202).json(successResponse('Quiz generation from Notion started', result))
  } catch (error) {
    next(error)
  }
}
