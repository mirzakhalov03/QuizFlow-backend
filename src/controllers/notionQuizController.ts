import { Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AuthRequest } from '../middlewares/authMiddleware'
import notionQuizService, {
  GenerateQuizFromNotionInput as NotionQuizServiceInput,
} from '../services/notion-quiz.service'
import notionService from '../services/notion.service'
import { GenerateQuizFromNotionInput } from '../validators/quiz.schema'
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
      pageIds,
      title,
      userInstructions,
      isTimerEnabled,
      timerDuration,
      type,
      questionCount,
      folderId,
      apiKeyId,
      model,
      difficulty,
    } = req.body as GenerateQuizFromNotionInput

    const payload: NotionQuizServiceInput = {
      userId,
      pageIds,
      title,
      userInstructions,
      isTimerEnabled: Boolean(isTimerEnabled),
      timerDuration,
      type,
      questionCount,
      folderId,
      apiKeyId,
      model,
      difficulty,
    }

    const result = await notionQuizService.generateQuizFromNotionPage(payload)

    return res.status(202).json(successResponse('Quiz generation from Notion started', result))
  } catch (error) {
    next(error)
  }
}
