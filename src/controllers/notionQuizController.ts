import { Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { AuthRequest } from '../middlewares/authMiddleware'
import notionQuizService, { type GenerateQuizFromNotionInput } from '../services/notionQuizService'
import notionService from '../services/notionService'
import type { QuestionType } from '../types/questionTypes'

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

    const {
      pageId,
      title,
      userInstructions,
      isTimerEnabled,
      timerDuration,
      type,
      questionCount,
      folderId,
    } = req.body as {
      pageId: string
      title?: string
      userInstructions?: string
      isTimerEnabled?: boolean
      timerDuration?: number
      type?: QuestionType
      questionCount?: number
      folderId?: string
    }

    if (!pageId) {
      throw new AppError('pageId is required', 400, 'VALIDATION_ERROR')
    }

    const payload: GenerateQuizFromNotionInput = {
      userId,
      pageId,
      title,
      userInstructions,
      isTimerEnabled: Boolean(isTimerEnabled),
      timerDuration: timerDuration ?? undefined,
      type,
      questionCount,
      folderId,
    }

    const result = await notionQuizService.generateQuizFromNotionPage(payload)

    return res.status(202).json(successResponse('Quiz generation from Notion started', result))
  } catch (error) {
    next(error)
  }
}
