import { z } from 'zod'

import { ALLOWED_MIME_TYPES } from '../helpers/utils/uploadUtils'

export const PresignedUrlSchema = z.object({
  filename: z
    .string({ message: 'filename query param is required' })
    .min(1, 'filename must not be empty')
    .trim(),

  contentType: z
    .string({ message: 'contentType query param is required' })
    .refine((v) => ALLOWED_MIME_TYPES.includes(v), {
      message: `contentType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
    }),
})

export type PresignedUrlQuery = z.infer<typeof PresignedUrlSchema>
