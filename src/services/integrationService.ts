import { eq, and } from 'drizzle-orm'

import { db } from '../database/database'
import { userIntegrations } from '../database/schema'
import UserIntegrations from '../models/userIntegration.model'

type GoogleTokenResponse = {
  access_token: string
  refresh_token?: string
  [key: string]: unknown
}

class IntegrationService {
  async upsertGoogle(userId: string, tokens: GoogleTokenResponse) {
    const existing = await UserIntegrations.findByUserIdAndProvider(userId, 'google')

    if (!existing) {
      return await UserIntegrations.createUser({
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? '',
        provider: 'google',
      })
    }

    return await db
      .update(userIntegrations)
      .set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing.refreshToken,
      })
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, 'google')))
  }

  async upsertNotion(userId: string, accessToken: string) {
    const existing = await UserIntegrations.findByUserIdAndProvider(userId, 'notion')

    if (!existing) {
      return await UserIntegrations.createUser({
        userId,
        accessToken,
        refreshToken: '',
        provider: 'notion',
      })
    }

    return await db
      .update(userIntegrations)
      .set({ accessToken })
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, 'notion')))
  }
}

export default new IntegrationService()
