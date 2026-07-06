import { z } from 'zod'

export const HistoryQuerySchema = z.object({
  /** Folder UUID, or omitted to return history across all folders. */
  folderId: z.string().uuid().optional(),
  /** Page size (capped to protect the DB). */
  limit: z.coerce.number().int().min(1).max(50).default(10),
  /** 1-based page number. */
  page: z.coerce.number().int().min(1).default(1),
  /** Ordering: most recent first, highest score first, or lowest score first. */
  sort: z.enum(['recent', 'best', 'worst']).default('recent'),
})

export type HistoryQuery = z.infer<typeof HistoryQuerySchema>
