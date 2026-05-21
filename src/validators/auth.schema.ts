import { z } from 'zod'

export const AuthRegisterSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(100),
  password: z.string().min(8),
})

export const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
})

export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export const SetPasswordSchema = z.object({
  password: z.string().min(8),
})
