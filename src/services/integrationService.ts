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

    return await UserIntegrations.updateByUserIdAndProvider(userId, 'google', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? existing.refreshToken,
    })
  }

  async getIntegrations(userId: string) {
    const integrations = await UserIntegrations.findAllByUserId(userId)
    return integrations.map(({ id, provider, createdAt, updatedAt }) => ({
      id,
      provider,
      createdAt,
      updatedAt,
    }))
  }

  async getIntegration(userId: string, provider: string) {
    const integration = await UserIntegrations.findByUserIdAndProvider(userId, provider)
    if (!integration) return null
    const { id, createdAt, updatedAt } = integration
    return { id, provider, createdAt, updatedAt }
  }

  async deleteIntegration(userId: string, provider: string) {
    const existing = await UserIntegrations.findByUserIdAndProvider(userId, provider)

    if (!existing) {
      return false
    }

    await UserIntegrations.deleteByUserIdAndProvider(userId, provider)
    return true
  }
}

export default new IntegrationService()
