import { z } from 'zod'

export const CreateByokSchema = z.object({
  keyName: z.string().trim().min(1, 'keyName is required').max(100),
  keyValue: z.string().min(8, 'keyValue must be at least 8 characters').max(2000),
  provider: z.string().trim().min(1, 'provider is required'),
})

export type CreateByokInput = z.infer<typeof CreateByokSchema>

export const UpdateByokSchema = z
  .object({
    keyName: z.string().trim().min(1).max(100).optional(),
    keyValue: z.string().min(8).max(2000).optional(),
    provider: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const { keyName, keyValue, provider } = data

    if (!keyName && !keyValue && !provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one of keyName, keyValue or provider is required',
      })
    }
  })

export type UpdateByokInput = z.infer<typeof UpdateByokSchema>
