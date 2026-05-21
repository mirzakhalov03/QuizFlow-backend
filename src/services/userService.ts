import crypto from 'crypto'

import bcrypt from 'bcryptjs'

import User from '../models/user.model'

type GoogleProfile = {
  email: string
  name: string
  picture?: string
  [key: string]: unknown
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

class UserService {
  async findByEmail(email: string) {
    return await User.findByEmail(email)
  }

  async createUser(data: { email: string; fullName: string }) {
    return await User.createUser({
      email: data.email,
      fullName: data.fullName,
    })
  }

  async createUserWithPassword(data: { email: string; fullName: string; password: string }) {
    const passwordHash = await bcrypt.hash(data.password, 10)

    return await User.createUser({
      email: data.email,
      fullName: data.fullName,
      password: passwordHash,
    })
  }

  async verifyCredentials(email: string, password: string) {
    const user = await this.findByEmail(email)
    if (!user || !user.password) return null

    const isValid = await bcrypt.compare(password, user.password)
    return isValid ? user : null
  }

  async findOrCreateByGoogle(profile: GoogleProfile) {
    const existingUser = await this.findByEmail(profile.email)

    if (existingUser) return existingUser

    return await this.createUser({
      email: profile.email,
      fullName: profile.name,
    })
  }

  async updateUser(
    id: string,
    data: {
      fullName?: string
      password?: string | null
      refreshToken?: string | null
      passwordResetTokenHash?: string | null
      passwordResetTokenExpiresAt?: Date | null
    },
  ) {
    return await User.updateUser(id, data)
  }

  async setPasswordResetToken(id: string, token: string, expiresAt: Date) {
    const tokenHash = hashToken(token)
    return await User.updateUser(id, {
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: expiresAt,
    })
  }

  async findByPasswordResetToken(token: string) {
    const tokenHash = hashToken(token)
    return await User.findByPasswordResetTokenHash(tokenHash)
  }

  async clearPasswordResetToken(id: string) {
    return await User.updateUser(id, {
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
    })
  }
}

export default new UserService()
