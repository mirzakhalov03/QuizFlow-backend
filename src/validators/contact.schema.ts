import { z } from 'zod'

export const ContactMessageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Enter a valid email').max(254),
  message: z.string().trim().min(1, 'Message is required').max(2000),
})

export type ContactMessageInput = z.infer<typeof ContactMessageSchema>
