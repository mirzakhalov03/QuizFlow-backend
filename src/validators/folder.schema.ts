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

export type CreateFolderInput = z.infer<typeof CreateFolderSchema>
export type UpdateFolderInput = z.infer<typeof UpdateFolderSchema>
export type AddQuizzesToFolderInput = z.infer<typeof AddQuizzesToFolderSchema>
export type MoveQuizToFolderInput = z.infer<typeof MoveQuizToFolderSchema>
