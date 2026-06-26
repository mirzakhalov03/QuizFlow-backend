export const MARKETPLACE_CATEGORIES = [
  'general',
  'science',
  'math',
  'history',
  'language',
  'technology',
  'business',
  'arts',
  'geography',
  'health',
  'other',
] as const

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]
