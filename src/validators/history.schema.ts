import { z } from 'zod'

export const HistoryQuerySchema = z.object({
  /** Folder UUID, or omitted to return history across all folders. */
  folderId: z.string().uuid().optional(),
  /** Page size. */
  limit: z.coerce
    .number()
    .int()
    .refine((n) => n === 5 || n === 10 || n === 50, {
      message: 'limit must be 5, 10, or 50',
    })
    .default(10),
  /** 1-based page number. */
  page: z.coerce.number().int().min(1).default(1),
  /** Ordering: most recent first, highest score first, or lowest score first. */
  sort: z.enum(['recent', 'best', 'worst']).default('recent'),
})

export type HistoryQuery = z.infer<typeof HistoryQuerySchema>
