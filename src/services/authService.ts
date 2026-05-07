import { eq } from 'drizzle-orm'
import jwt from 'jsonwebtoken'

import integrationService from './integrationService'
import profileService from './profileService'
import userService from './userService'
import { db } from '../database/database'
import { users } from '../database/schema'
import { generateAccessToken, generateRefreshToken } from '../helpers/utils/jwt'
import User from '../models/user.model'

class AuthService {
  async handleGoogleOAuth(code: string) {
    const tokens = await this.exchangeGoogleCode(code)
    const profile = await this.fetchGoogleProfile(tokens.access_token)

    const user = await userService.findOrCreateByGoogle(profile)

    await profileService.ensureProfile(user.id, profile)
    await integrationService.upsertGoogle(user.id, tokens)

    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken(user)

    await this.storeRefreshToken(user.id, refreshToken)

    return { user, accessToken, refreshToken }
  }

  async handleNotionOAuth(userId: string, code: string) {
    const token = await this.exchangeNotionCode(code)

    if (!token?.access_token) {
      throw new Error('Failed to get Notion token')
    }

    await integrationService.upsertNotion(userId, token.access_token)

    return true
  }

  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken) {
      throw new Error('No refresh token')
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as { id: string }

    const user = await User.findById(decoded.id)

    if (!user || user.refreshToken !== refreshToken) {
      throw new Error('Invalid refresh token')
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

    return await res.json()
  }

  private async fetchGoogleProfile(accessToken: string) {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    return await res.json()
  }

  private async exchangeNotionCode(code: string) {
    const res = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`,
          ).toString('base64'),
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI,
      }),
    })

    return await res.json()
  }
}

export default new AuthService()
