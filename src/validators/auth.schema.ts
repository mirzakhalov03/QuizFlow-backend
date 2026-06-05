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
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(8),
})

export const SetPasswordSchema = z.object({
  password: z.string().min(8),
})

export const RegisterConfirmSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
})

export const DeleteAccountRequestSchema = z.object({})

export const DeleteAccountConfirmSchema = z.object({
  otp: z.string().length(6),
})
