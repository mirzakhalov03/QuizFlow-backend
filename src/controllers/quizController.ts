import type { Request, Response, NextFunction } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { getAuthUserId } from '../helpers/utils/authUtils'
import { parseS3Url } from '../helpers/utils/quizUtils'
import { invokeQuizGenerator } from '../services/helpers/invokeQuizGenerator'
import notionQuizService from '../services/notion-quiz.service'
import profileService from '../services/profile.service'
import { getQuizResult, submitQuiz } from '../services/quiz-submission.service'
import { getPublicQuizByToken } from '../services/quiz.service'
import { setQuizSharing } from '../services/quiz.service'
import {
  deleteQuizById,
  getJobById,
  getQuizById,
  getQuizzes,
  updateQuizById,
} from '../services/quiz.service'
import { generateQuizPdf } from '../services/quizPdf.service'
import type {
  GenerateQuizInput,
  GetQuizzesQuery,
  PatchQuizInput,
  SubmitQuizInput,
} from '../validators/quiz.schema'

export const generateQuizController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const source = (req.query as { source: string }).source

    const {
      pageIds,
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
      difficulty,
      folderId,
      apiKeyId,
    } = req.body as GenerateQuizInput
    if (source === 'notion') {
      if (!pageIds || pageIds.length === 0) {
        throw new AppError('pageIds is required for source=notion', 400, 'VALIDATION_ERROR')
      }

      const result = await notionQuizService.generateQuizFromNotionPage({
        userId,
        pageIds,
        title,
        userInstructions,
        timerDuration,
        type,
        questionCount,
        isTimerEnabled: Boolean(isTimerEnabled),
        folderId,
        apiKeyId,
        model,
        difficulty,
      })

      return res.status(202).json(successResponse('Quiz generation started', result))
    }

    // source === 'file' (default)
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

    if (!resolvedKeys || resolvedKeys.length === 0) {
      resolvedKeys = resolvedKey ? [resolvedKey] : []
    }

    if (resolvedKeys.length === 0) {
      throw new AppError(
        'Either s3Url, key, or keys is required for source=file',
        400,
        'VALIDATION_ERROR',
      )
    }

    const userBio = await profileService.getProfileBio(userId)
    const jobId = await invokeQuizGenerator({
      bucket: resolvedBucket!,
      keys: resolvedKeys!,
      userId,
      title,
      userInstructions,
      isTimerEnabled: Boolean(isTimerEnabled),
      timerDuration: timerDuration ?? undefined,
      type,
      questionCount,
      model,
      userBio,
      difficulty,
      folderId,
      apiKeyId,
    })

    return res.status(202).json(
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

    const { limit, offset, search, types, sort, excludeFolderId } =
      req.query as unknown as GetQuizzesQuery

    const { items, total } = await getQuizzes({
      userId,
      limit,
      offset,
      search,
      types,
      sort,
      excludeFolderId,
    })

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

export const exportQuizPdfController = async (req: Request, res: Response, next: NextFunction) => {
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

    const withAnswers = req.query.withAnswers !== 'false'
    const pdf = await generateQuizPdf(quiz, withAnswers)

    const safeName = quiz.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'quiz'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${safeName}.pdf"`)
    res.status(200).send(pdf)
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

export const getQuizResultController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const rawId = req.params.id
    const quizId = typeof rawId === 'string' ? rawId : rawId?.[0]
    if (!quizId) {
      throw new AppError('Invalid quiz id', 400, 'VALIDATION_ERROR')
    }

    const data = await getQuizResult(quizId, userId)
    if (!data) {
      throw new AppError('Result not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('Quiz result retrieved', data))
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
