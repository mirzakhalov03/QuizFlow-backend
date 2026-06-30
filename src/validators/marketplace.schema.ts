import { z } from 'zod'

import { MARKETPLACE_CATEGORIES } from '../constants/marketplaceCategories'

// A custom category label is only meaningful when category === 'other'; capped at 50 chars.
const customCategory = z.string().trim().max(50, 'Custom category must be 50 characters or fewer')

export const PublishListingSchema = z.object({
  description: z.string().max(500).optional(),
  category: z.enum(MARKETPLACE_CATEGORIES).default('general'),
  customCategory: customCategory.optional(),
})

export const UpdateListingSchema = z
  .object({
    description: z.string().max(500).optional(),
    category: z.enum(MARKETPLACE_CATEGORIES).optional(),
    customCategory: customCategory.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })

export const BrowseListingsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(MARKETPLACE_CATEGORIES).optional(),
  sort: z.enum(['popular', 'recent', 'rating']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
})

export const RateListingSchema = z.object({
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
})

export const ReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

export type PublishListingInput = z.infer<typeof PublishListingSchema>
export type UpdateListingInput = z.infer<typeof UpdateListingSchema>
export type BrowseListingsInput = z.infer<typeof BrowseListingsSchema>
export type RateListingInput = z.infer<typeof RateListingSchema>
export type ReviewsQueryInput = z.infer<typeof ReviewsQuerySchema>
