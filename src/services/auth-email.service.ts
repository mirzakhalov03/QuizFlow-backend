import crypto from 'crypto'

import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

import authService from './auth.service'
import emailService from './clients/email.client'
import profileService from './profile.service'
import userService from './user.service'
import { logger } from '../config/logger'
import { db } from '../database/database'
import { users } from '../database/schema'
import { AppError } from '../helpers/AppError'
import { generateAccessToken, generateRefreshToken } from '../helpers/utils/jwt'
import Otp, { RESET_EXPIRATION_MS } from '../models/otp.model'
import User from '../models/user.model'

const getResetUrl = (token: string) => {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
  return `${frontendUrl}/auth/reset-password?token=${token}`
}

class AuthEmailService {
  private async generateTokens(user: { id: string }) {
    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken(user)

    await authService.storeRefreshToken(user.id, refreshToken)

    return { accessToken, refreshToken }
  }

  // Step 1: Create unverified user and send OTP
  async register(email: string, fullName: string, password: string) {
    const existingUser = await userService.findByEmail(email)

    if (existingUser && existingUser.isVerified) {
      throw new AppError('User already exists', 409)
    }

    if (!existingUser) {
      await userService.createUserWithPassword({
        email,
        fullName,
        password,
        isVerified: false,
      })
    }

    const code = Otp.generateCode()
    await Otp.upsert(`register:${email}`, code)
    await this.sendRegistrationOtpEmail(email, fullName, code)
  }

  // Step 2: Confirm OTP → activate user → log in
  async confirmRegistration(email: string, code: string) {
    const user = await userService.findByEmail(email)

    if (!user) {
      throw new AppError('No registration found for this email', 400, 'INVALID_OTP')
    }

    if (user.isVerified) {
      throw new AppError('Account already verified', 400, 'ALREADY_VERIFIED')
    }

    const result = await Otp.verify(`register:${email}`, code)

    if (result === 'invalid') throw new AppError('Invalid OTP', 400, 'INVALID_OTP')
    if (result === 'expired') throw new AppError('OTP has expired', 400, 'OTP_EXPIRED')

    await User.updateUser(user.id, { isVerified: true })
    await Otp.delete(`register:${email}`)
    // Provision the profile here (mirrors the Google OAuth path) so every verified
    // user always has one — keeps GET /userProfile/me a pure read.
    await profileService.ensureProfile(user.id)
    await this.sendWelcomeEmail(user.email, user.fullName)

    return await this.generateTokens(user)
  }

  async login(email: string, password: string) {
    const user = await userService.verifyCredentials(email, password)

    if (!user) {
      throw new AppError('Invalid email or password', 401)
    }

    if (!user.isVerified) {
      throw new AppError('Please verify your email before logging in', 403, 'EMAIL_NOT_VERIFIED')
    }

    const tokens = await this.generateTokens(user)
    return { user, ...tokens }
  }

  async requestPasswordReset(email: string) {
    const user = await userService.findByEmail(email)

    if (!user) {
      logger.info('Password reset: user not found', { email })
      return
    }

    if (!user.password) {
      logger.info('Password reset: user has no password (OAuth-only)', { email })
      return
    }

    if (!user.isVerified) {
      logger.info('Password reset: user not verified', { email })
      return
    }

    const token = crypto.randomBytes(32).toString('hex')
    await Otp.upsert(`reset:${user.id}`, token, RESET_EXPIRATION_MS)
    logger.info('Password reset: sending email', { email })
    await this.sendPasswordResetEmail(user.email, user.fullName, token)
    logger.info('Password reset: email sent', { email })
  }

  async setPassword(userId: string, password: string) {
    const user = await User.findById(userId)

    if (!user) {
      throw new AppError('User not found', 404)
    }

    if (user.password) {
      throw new AppError('Password already set. Use password reset to change it.', 400)
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await userService.updateUser(userId, { password: passwordHash })
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await User.findById(userId)

    if (!user) {
      throw new AppError('User not found', 404)
    }

    if (!user.password) {
      throw new AppError('No password set. Use set-password instead.', 400, 'NO_PASSWORD')
    }

    const isValid = await bcrypt.compare(currentPassword, user.password)

    if (!isValid) {
      throw new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD')
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await userService.updateUser(userId, { password: passwordHash })
  }

  async resetPassword(email: string, token: string, password: string) {
    const user = await userService.findByEmail(email)

    if (!user) {
      throw new AppError('Invalid or expired password reset token', 400)
    }

    const result = await Otp.verify(`reset:${user.id}`, token)

    if (result === 'invalid') throw new AppError('Invalid or expired password reset token', 400)
    if (result === 'expired') throw new AppError('Password reset token has expired', 400)

    const passwordHash = await bcrypt.hash(password, 10)
    await userService.updateUser(user.id, { password: passwordHash })
    await Otp.delete(`reset:${user.id}`)
  }

  async requestDeleteAccount(userId: string) {
    const user = await User.findById(userId)

    if (!user) {
      throw new AppError('User not found', 404)
    }

    const code = Otp.generateCode()
    await Otp.upsert(`delete:${userId}`, code)
    await this.sendDeleteAccountOtpEmail(user.email, user.fullName, code)
  }

  async confirmDeleteAccount(userId: string, code: string) {
    const result = await Otp.verify(`delete:${userId}`, code)

    if (result === 'invalid') throw new AppError('Invalid OTP', 400, 'INVALID_OTP')
    if (result === 'expired') throw new AppError('OTP has expired', 400, 'OTP_EXPIRED')

    await db.delete(users).where(eq(users.id, userId))
    await Otp.delete(`delete:${userId}`)
  }

  private async sendRegistrationOtpEmail(email: string, fullName: string, code: string) {
    await emailService.sendEmail({
      to: email,
      subject: 'Your QuizFlow verification code',
      text: `Hi ${fullName},\n\nYour verification code is: ${code}\n\nIt expires in 15 minutes. If you did not request this, ignore this email.`,
      html: `<p>Hi ${fullName},</p><p>Your verification code is:</p><h2>${code}</h2><p>It expires in 15 minutes.</p>`,
    })
  }

  private async sendWelcomeEmail(email: string, fullName: string) {
    await emailService.sendEmail({
      to: email,
      subject: 'Welcome to QuizFlow',
      text: `Hi ${fullName},\n\nWelcome to QuizFlow. Your account has been created successfully.\n\nIf you have any questions, reply to this email.`,
    })
  }

  private async sendPasswordResetEmail(email: string, fullName: string, token: string) {
    const resetUrl = getResetUrl(token)

    await emailService.sendEmail({
      to: email,
      subject: 'Reset your QuizFlow password',
      text: `Hi ${fullName},\n\nYou requested a password reset. Click or paste the link below to set a new password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      html: `<p>Hi ${fullName},</p><p>You requested a password reset. Click the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
    })
  }

  private async sendDeleteAccountOtpEmail(email: string, fullName: string, code: string) {
    await emailService.sendEmail({
      to: email,
      subject: 'Confirm account deletion',
      text: `Hi ${fullName},\n\nYour account deletion code is: ${code}\n\nIt expires in 15 minutes. If you did not request this, ignore this email — your account is safe.`,
      html: `<p>Hi ${fullName},</p><p>Your account deletion confirmation code is:</p><h2>${code}</h2><p>It expires in 15 minutes. If you did not request this, ignore this email — your account is safe.</p>`,
    })
  }
}

export default new AuthEmailService()
