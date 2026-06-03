import type { Request, Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { getAuthUserId } from '../helpers/utils/authUtils'
import { parseS3Url } from '../helpers/utils/quizUtils'
import { invokeQuizGenerator } from '../services/invokeQuizGenerator'
import profileService from '../services/profileService'
import { getPublicQuizByToken } from '../services/quiz.service'
import { setQuizSharing } from '../services/quiz.service'
import {
  deleteQuizById,
  getJobById,
  getQuizById,
  getQuizzes,
  submitQuiz,
  updateQuizById,
} from '../services/quiz.service'
import type {
  GenerateQuizInput,
  GetQuizzesQuery,
  PatchQuizInput,
  SubmitQuizInput,
} from '../validators/quiz.schema'

export const generateQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const {
      s3Url,
      bucket,
      key,
      keys,
      title,
      userInstructions,
      isTimerEnabled,
      timerDuration,
      type,
      questionCount,
      model,
    } = req.body as GenerateQuizInput

    let resolvedBucket = bucket
    let resolvedKey = key
    let resolvedKeys = keys

    if (s3Url) {
      const parsed = parseS3Url(s3Url)
      resolvedBucket = parsed.bucket
      resolvedKey = parsed.key
    }

    if (!resolvedBucket) {
      resolvedBucket = process.env.AWS_BUCKET_NAME
      if (!resolvedBucket) {
        throw new AppError('AWS_BUCKET_NAME env var is not set', 500, 'INTERNAL_ERROR')
      }
    }

    // Normalise to keys array: prefer explicit keys, else wrap single key
    if (!resolvedKeys || resolvedKeys.length === 0) {
      resolvedKeys = resolvedKey ? [resolvedKey] : []
    }

    const userBio = await profileService.getProfileBio(userId)
    const jobId = await invokeQuizGenerator({
      bucket: resolvedBucket,
      keys: resolvedKeys,
      userId,
      title,
      userInstructions,
      isTimerEnabled: Boolean(isTimerEnabled),
      timerDuration,
      type,
      questionCount,
      model,
      userBio,
    })

    res.status(202).json(
      successResponse('Quiz generation started', {
        jobId,
        pollUrl: `/quizzes/jobs/${jobId}`,
      }),
    )
  } catch (error) {
    next(error)
  }
}

export const getJobStatusController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const rawJobId = req.params.jobId
    const jobId = typeof rawJobId === 'string' ? rawJobId : rawJobId?.[0]
    if (!jobId) {
      throw new AppError('jobId is required', 400, 'VALIDATION_ERROR')
    }

    const job = await getJobById(jobId, userId)
    if (!job) {
      throw new AppError('Job not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Job status retrieved', job))
  } catch (error) {
    next(error)
  }
}

export const getQuizzesController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const { limit, offset, search, types, sort } = req.query as unknown as GetQuizzesQuery

    const { items, total } = await getQuizzes({ userId, limit, offset, search, types, sort })

    res.status(200).json(
      successResponse('Quizzes retrieved successfully', {
        items,
        pagination: { limit, offset, count: total },
        filters: { search: search ?? null, types: types ?? null, sort },
      }),
    )
  } catch (error) {
    next(error)
  }
}

export const getPublicQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.params.shareToken
    const shareToken = typeof rawToken === 'string' ? rawToken : rawToken?.[0]

    if (!shareToken) throw new AppError('Share token is required', 400, 'VALIDATION_ERROR')

    const quiz = await getPublicQuizByToken(shareToken)

    if (!quiz) throw new AppError('Quiz not found or is not public', 404, 'NOT_FOUND')

    res.status(200).json(successResponse('Public quiz retrieved successfully', quiz))
  } catch (error) {
    next(error)
  }
}

export const getQuizByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const rawId = req.params.id
    const id = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!id) {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }

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
    const userId = getAuthUserId(req)

    const rawId = req.params.id
    const id = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!id) {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }

    const { title, userInstructions, isTimerEnabled, timerDuration, type } =
      req.body as PatchQuizInput

    const updatedQuiz = await updateQuizById(
      id,
      {
        title,
        userInstructions,
        isTimerEnabled,
        timerDuration: isTimerEnabled === false ? null : (timerDuration ?? undefined),
        type,
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

export const submitQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const rawId = req.params.id
    const quizId = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!quizId) {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }

    const { answers } = req.body as SubmitQuizInput

    const result = await submitQuiz(quizId, userId, answers)
    if (!result) {
      throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Quiz submitted successfully', result))
  } catch (error) {
    next(error)
  }
}
export const enableSharingController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const rawId = req.params.id

    const id = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!id) {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }

    const result = await setQuizSharing(id, userId, true)

    if (!result) {
      throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Sharing enabled successfully', result))
  } catch (error) {
    next(error)
  }
}
export const disableSharingController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const rawId = req.params.id

    const id = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!id) {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }

    const result = await setQuizSharing(id, userId, false)

    if (!result) {
      throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Sharing disabled successfully', result))
  } catch (error) {
    next(error)
  }
}
export const deleteQuizByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const rawId = req.params.id
    const id = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!id) {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }

    const deleted = await deleteQuizById(id, userId)
    if (!deleted) {
      throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Quiz deleted successfully', { id }))
  } catch (error) {
    next(error)
  }
}
