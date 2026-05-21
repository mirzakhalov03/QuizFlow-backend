import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'

import integrationService from './integrationService'
import notionService from './notionService'
import profileService from './profileService'
import userService from './userService'
import { db } from '../database/database'
import { users } from '../database/schema'
import { AppError } from '../helpers/AppError'
import { generateAccessToken, generateRefreshToken } from '../helpers/utils/jwt'
import User from '../models/user.model'

class AuthService {
  async handleGoogleOAuth(code: string) {
    const tokens = await this.exchangeGoogleCode(code)
    const profile = await this.fetchGoogleProfile(tokens.access_token)

    if (!profile?.email || !profile?.name) {
      throw new Error(`Google profile missing required fields: ${JSON.stringify(profile)}`)
    }

    const user = await userService.findOrCreateByGoogle(profile)

    await profileService.ensureProfile(user.id, profile)
    await integrationService.upsertGoogle(user.id, tokens)

    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken(user)

    await this.storeRefreshToken(user.id, refreshToken)

    return { user, accessToken, refreshToken }
  }

  async handleNotionOAuth(userId: string, code: string) {
    return notionService.connect(userId, code)
  }

  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken) {
      throw new Error('No refresh token')
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as { id: string }

    const user = await User.findById(decoded.id)

    if (!user || user.refreshToken !== refreshToken) {
      throw new AppError('No refresh token', 401)
    }

    return generateAccessToken({ id: user.id })
  }
  async storeRefreshToken(userId: string, token: string) {
    await db.update(users).set({ refreshToken: token }).where(eq(users.id, userId))
  }

  private async exchangeGoogleCode(code: string) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Failed to exchange code for token: ${res.status} ${errorText}`)
    }

    return await res.json()
  }

  private async fetchGoogleProfile(accessToken: string) {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Failed to fetch Google profile: ${res.status} ${errorText}`)
    }

    return await res.json()
  }
}

export default new AuthService()
