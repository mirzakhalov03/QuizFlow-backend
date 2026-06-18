import { z } from 'zod'

export const CreateByokSchema = z.object({
  keyName: z.string().trim().min(1, 'keyName is required').max(100),
  keyValue: z.string().min(8, 'keyValue must be at least 8 characters').max(2000),
  provider: z.string().trim().min(1, 'provider is required'),
})

export type CreateByokInput = z.infer<typeof CreateByokSchema>

export const UpdateByokSchema = z
  .object({
    keyName: z.string().trim().max(100).optional().nullable(),
    keyValue: z.string().max(2000).optional().nullable(),
    provider: z.string().trim().optional().nullable(),
  })
  .transform((data) => {
    const clean = (val: string | null | undefined) => {
      if (val === null || val === undefined || val.trim() === '') {
        return undefined
      }
      return val
    }
    return {
      keyName: clean(data.keyName),
      keyValue:
        data.keyValue === null || data.keyValue === undefined || data.keyValue.trim() === ''
          ? undefined
          : data.keyValue,
      provider: clean(data.provider),
    }
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

    if (keyValue) {
      const isMasked = keyValue === '********' || keyValue.includes('...')
      if (!isMasked && keyValue.length < 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['keyValue'],
          message: 'keyValue must be at least 8 characters',
        })
      }
    }
  })

export type UpdateByokInput = z.infer<typeof UpdateByokSchema>
