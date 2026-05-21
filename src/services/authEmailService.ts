import crypto from 'crypto'

import bcrypt from 'bcryptjs'

import authService from './authService'
import emailService from './emailService'
import userService from './userService'
import { AppError } from '../helpers/AppError'
import { generateAccessToken, generateRefreshToken } from '../helpers/utils/jwt'
import User from '../models/user.model'

const RESET_TOKEN_EXPIRATION_MS = 1000 * 60 * 60

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

  async register(email: string, fullName: string, password: string) {
    const existingUser = await userService.findByEmail(email)

    if (existingUser) {
      throw new AppError('User already exists', 409)
    }

    const user = await userService.createUserWithPassword({
      email,
      fullName,
      password,
    })

    await this.sendWelcomeEmail(user.email, user.fullName)

    const tokens = await this.generateTokens(user)

    return { user, ...tokens }
  }

  async login(email: string, password: string) {
    const user = await userService.verifyCredentials(email, password)

    if (!user) {
      throw new AppError('Invalid email or password', 401)
    }

    const tokens = await this.generateTokens(user)
    return { user, ...tokens }
  }

  async requestPasswordReset(email: string) {
    const user = await userService.findByEmail(email)

    if (!user || !user.password) {
      return
    }

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRATION_MS)

    await userService.setPasswordResetToken(user.id, token, expiresAt)
    await this.sendPasswordResetEmail(user.email, user.fullName, token)
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

  async resetPassword(token: string, password: string) {
    const user = await userService.findByPasswordResetToken(token)

    if (!user) {
      throw new AppError('Invalid or expired password reset token', 400)
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await userService.updateUser(user.id, { password: passwordHash })
    await userService.clearPasswordResetToken(user.id)
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
}

export default new AuthEmailService()
