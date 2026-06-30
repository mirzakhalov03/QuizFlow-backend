import { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { AuthRequest } from '../middlewares/authMiddleware'
import * as marketplaceService from '../services/marketplace.service'
import {
  BrowseListingsInput,
  PublishListingInput,
  RateListingInput,
  ReviewsQueryInput,
  UpdateListingInput,
} from '../validators/marketplace.schema'

export const browseListings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const params = req.query as unknown as BrowseListingsInput
    // optionalAuthMiddleware populates req.user when signed in → drives `isMine`.
    const result = await marketplaceService.browseListings({ ...params, userId: req.user?.id })
    return res.json(successResponse('Marketplace listings retrieved', result))
  } catch (error) {
    next(error)
  }
}

export const getListing = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const listing = await marketplaceService.getListingDetail(quizId, req.user?.id)
    if (!listing) throw new AppError('Listing not found', 404, 'NOT_FOUND')
    return res.json(successResponse('Listing retrieved', listing))
  } catch (error) {
    next(error)
  }
}

export const publishListing = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const input = req.body as PublishListingInput
    const listing = await marketplaceService.publishListing(req.user!.id, quizId, input)
    if (!listing) throw new AppError('Quiz not found', 404, 'NOT_FOUND')
    return res.json(successResponse('Quiz published to marketplace', listing))
  } catch (error) {
    next(error)
  }
}

export const updateListing = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const patch = req.body as UpdateListingInput
    const listing = await marketplaceService.updateListing(req.user!.id, quizId, patch)
    if (!listing) throw new AppError('Listing not found', 404, 'NOT_FOUND')
    return res.json(successResponse('Listing updated', listing))
  } catch (error) {
    next(error)
  }
}

export const unpublishListing = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const ok = await marketplaceService.unpublishListing(req.user!.id, quizId)
    if (!ok) throw new AppError('Listing not found', 404, 'NOT_FOUND')
    return res.json(successResponse('Listing removed from marketplace', null))
  } catch (error) {
    next(error)
  }
}

export const getRatings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const { page, pageSize } = req.query as unknown as ReviewsQueryInput
    const result = await marketplaceService.getRatings(quizId, page, pageSize)
    return res.json(successResponse('Reviews retrieved', result))
  } catch (error) {
    next(error)
  }
}

export const rateListing = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const input = req.body as RateListingInput
    await marketplaceService.upsertRating(req.user!.id, quizId, input)
    return res.json(successResponse('Rating saved', null))
  } catch (error) {
    next(error)
  }
}
