import type { Request, Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { parseS3Url } from '../helpers/utils/quizUtils'
import { invokeQuizGenerator } from '../services/invokeQuizGenerator'
import { deleteQuizById, getQuizById, getQuizzes, updateQuizById } from '../services/quiz.service'
import { QUESTION_TYPES } from '../types/questionTypes'
import type { QuestionType } from '../types/questionTypes'

type QuizGenerateBody = {
  s3Url?: string
  bucket?: string
  key?: string
  userId?: string
  title?: string
  userInstructions?: string
  isTimerEnabled?: boolean
  timerDuration?: number
  type?: QuestionType
}

type PatchQuizBody = {
  title?: string
  userInstructions?: string | null
  isTimerEnabled?: boolean
  timerDuration?: number | null
  type?: QuestionType
}

const isQuestionType = (value: string): value is QuestionType =>
  QUESTION_TYPES.includes(value as QuestionType)

export const generateQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      s3Url,
      bucket,
      key,
      userId,
      title,
      userInstructions,
      isTimerEnabled,
      timerDuration,
      type,
    } = req.body as QuizGenerateBody

    if (!userId) {
      throw new AppError('userId is required', 400, 'VALIDATION_ERROR')
    }

    let resolvedBucket = bucket
    let resolvedKey = key

    if (s3Url) {
      const parsed = parseS3Url(s3Url)
      resolvedBucket = parsed.bucket
      resolvedKey = parsed.key
    }

    if (!resolvedKey) {
      throw new AppError('key is required', 400, 'VALIDATION_ERROR')
    }

    if (!resolvedBucket) {
      const fallbackBucket = process.env.AWS_BUCKET_NAME
      if (!fallbackBucket) {
        throw new AppError('bucket is required', 400, 'VALIDATION_ERROR')
      }
      resolvedBucket = fallbackBucket
    }

    const parsedTimerDuration =
      typeof timerDuration === 'number'
        ? timerDuration
        : typeof timerDuration === 'string'
          ? Number(timerDuration)
          : undefined

    if (parsedTimerDuration !== undefined && Number.isNaN(parsedTimerDuration)) {
      throw new AppError('timerDuration must be a number', 400, 'VALIDATION_ERROR')
    }

    if (isTimerEnabled && !parsedTimerDuration) {
      throw new AppError('timerDuration is required when timer is enabled', 400, 'VALIDATION_ERROR')
    }

    if (type && !isQuestionType(type)) {
      throw new AppError('type must be a valid question type', 400, 'VALIDATION_ERROR')
    }

    const requestId = await invokeQuizGenerator({
      bucket: resolvedBucket,
      key: resolvedKey,
      userId,
      title,
      userInstructions,
      isTimerEnabled: Boolean(isTimerEnabled),
      timerDuration: parsedTimerDuration,
      type,
    })

    res.status(202).json(
      successResponse('Quiz generation started', {
        requestId,
      }),
    )
  } catch (error) {
    next(error)
  }
}

export const getQuizzesController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0

    if (Number.isNaN(limit) || limit <= 0 || limit > 100) {
      throw new AppError('limit must be a number between 1 and 100', 400, 'VALIDATION_ERROR')
    }

    if (Number.isNaN(offset) || offset < 0) {
      throw new AppError('offset must be a non-negative number', 400, 'VALIDATION_ERROR')
    }

    const items = await getQuizzes({ userId, limit, offset })

    res.status(200).json(
      successResponse('Quizzes retrieved successfully', {
        items,
        pagination: { limit, offset, count: items.length },
      }),
    )
  } catch (error) {
    next(error)
  }
}

export const getQuizByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id
    if (typeof rawId !== 'string') {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }
    const id = rawId
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined

    const quiz = await getQuizById(id, userId)
    if (!quiz) {
      throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Quiz retrieved successfully', quiz))
  } catch (error) {
    next(error)
  }
}

export const patchQuizByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id
    if (typeof rawId !== 'string') {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }
    const id = rawId
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined
    const body = req.body as PatchQuizBody

    const hasAnyField =
      body.title !== undefined ||
      body.userInstructions !== undefined ||
      body.isTimerEnabled !== undefined ||
      body.timerDuration !== undefined ||
      body.type !== undefined

    if (!hasAnyField) {
      throw new AppError('At least one updatable field is required', 400, 'VALIDATION_ERROR')
    }

    const parsedTimerDuration =
      typeof body.timerDuration === 'number'
        ? body.timerDuration
        : typeof body.timerDuration === 'string'
          ? Number(body.timerDuration)
          : body.timerDuration

    if (parsedTimerDuration !== undefined && parsedTimerDuration !== null) {
      if (Number.isNaN(parsedTimerDuration) || parsedTimerDuration <= 0) {
        throw new AppError('timerDuration must be a positive number', 400, 'VALIDATION_ERROR')
      }
    }

    if (
      body.isTimerEnabled === true &&
      (parsedTimerDuration === undefined || parsedTimerDuration === null)
    ) {
      throw new AppError('timerDuration is required when timer is enabled', 400, 'VALIDATION_ERROR')
    }

    if (body.type && !isQuestionType(body.type)) {
      throw new AppError('type must be a valid question type', 400, 'VALIDATION_ERROR')
    }

    const updatedQuiz = await updateQuizById(
      id,
      {
        title: body.title,
        userInstructions: body.userInstructions,
        isTimerEnabled: body.isTimerEnabled,
        timerDuration: body.isTimerEnabled === false ? null : (parsedTimerDuration ?? undefined),
        type: body.type,
      },
      userId,
    )

    if (!updatedQuiz) {
      throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Quiz updated successfully', updatedQuiz))
  } catch (error) {
    next(error)
  }
}

export const deleteQuizByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id
    if (typeof rawId !== 'string') {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }
    const id = rawId
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined

    const deleted = await deleteQuizById(id, userId)
    if (!deleted) {
      throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Quiz deleted successfully', { id }))
  } catch (error) {
    next(error)
  }
}
