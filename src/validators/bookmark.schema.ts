import { z } from 'zod'

export const GetBookmarksSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type GetBookmarksQuery = z.infer<typeof GetBookmarksSchema>
