import { z } from 'zod'

export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(100),
  quizIds: z.array(z.string().uuid()).max(100).optional(),
})

export const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(100),
})

export const AddQuizzesToFolderSchema = z.object({
  quizIds: z.array(z.string().uuid()).min(1).max(100),
})

export const MoveQuizToFolderSchema = z.object({
  folderId: z.string().uuid().nullable(),
})

export const GetFoldersSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(1000, 'limit must be at most 1000')
    .default(20),
  offset: z.coerce.number().int().min(0, 'offset must be a non-negative integer').default(0),
  search: z.string().trim().min(1).optional(),
})

export const GetQuizzesInFolderSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(1000, 'limit must be at most 1000')
    .default(20),
  offset: z.coerce.number().int().min(0, 'offset must be a non-negative integer').default(0),
})

export type CreateFolderInput = z.infer<typeof CreateFolderSchema>
export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>
export type AddQuizzesToFolderInput = z.infer<typeof AddQuizzesToFolderSchema>
export type MoveQuizToFolderInput = z.infer<typeof MoveQuizToFolderSchema>
export type GetFoldersQuery = z.infer<typeof GetFoldersSchema>
export type GetQuizzesInFolderQuery = z.infer<typeof GetQuizzesInFolderSchema>
