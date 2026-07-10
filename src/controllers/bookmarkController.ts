import type { Request, Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { getAuthUserId } from '../helpers/utils/authUtils'
import { addBookmark, getBookmarks, removeBookmark } from '../services/bookmark.service'
import type { GetBookmarksQuery } from '../validators/bookmark.schema'

export const addBookmarkController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const rawId = req.params.questionId
    const questionId = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!questionId) throw new AppError('questionId is required', 400, 'VALIDATION_ERROR')

    await addBookmark(userId, questionId)

    res.status(201).json(successResponse('Question bookmarked', { questionId }))
  } catch (error) {
    next(error)
  }
}

export const removeBookmarkController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const rawId = req.params.questionId
    const questionId = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!questionId) throw new AppError('questionId is required', 400, 'VALIDATION_ERROR')

    await removeBookmark(userId, questionId)

    res.status(200).json(successResponse('Bookmark removed', { questionId }))
  } catch (error) {
    next(error)
  }
}

export const getBookmarksController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const { limit, offset } = req.query as unknown as GetBookmarksQuery

    const bookmarks = await getBookmarks(userId, limit, offset)

    res.status(200).json(
      successResponse('Bookmarks retrieved', {
        items: bookmarks,
        count: bookmarks.length,
      }),
    )
  } catch (error) {
    next(error)
  }
}
