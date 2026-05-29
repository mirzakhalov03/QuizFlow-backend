import { Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AuthRequest } from '../middlewares/authMiddleware'
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
