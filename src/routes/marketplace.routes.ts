import { Router } from 'express'

import * as marketplaceController from '../controllers/marketplaceController'
import { authMiddleware, optionalAuthMiddleware } from '../middlewares/authMiddleware'
import { validate, validateQuery } from '../middlewares/validate'
import {
  BrowseListingsSchema,
  PublishListingSchema,
  RateListingSchema,
  ReviewsQuerySchema,
  UpdateListingSchema,
} from '../validators/marketplace.schema'

const router = Router()

// Public reads (optionalAuthMiddleware lets signed-in viewers see `isMine`)
router.get(
  '/marketplace',
  optionalAuthMiddleware,
  validateQuery(BrowseListingsSchema),
  marketplaceController.browseListings,
)
router.get(
  '/marketplace/:quizId/ratings',
  validateQuery(ReviewsQuerySchema),
  marketplaceController.getRatings,
)
router.get('/marketplace/:quizId', optionalAuthMiddleware, marketplaceController.getListing)

// Author actions (auth + ownership enforced in the service)
router.post(
  '/marketplace/:quizId',
  authMiddleware,
  validate(PublishListingSchema),
  marketplaceController.publishListing,
)
router.patch(
  '/marketplace/:quizId',
  authMiddleware,
  validate(UpdateListingSchema),
  marketplaceController.updateListing,
)
router.delete('/marketplace/:quizId', authMiddleware, marketplaceController.unpublishListing)

// Taker action: rate a quiz you've taken (gate enforced in the service)
router.post(
  '/marketplace/:quizId/ratings',
  authMiddleware,
  validate(RateListingSchema),
  marketplaceController.rateListing,
)

export default router
