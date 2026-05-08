import { Client } from '@notionhq/client'

import UserIntegrations from '../models/userIntegration.model'

class NotionService {
  async connect(userId: string, code: string) {
    const tokenData = await this.exchangeCode(code)

    if (!tokenData?.access_token) {
      throw new Error('Failed to get Notion token')
    }

    await this.saveIntegration(userId, tokenData.access_token)
    return true
  }

  async getClientForUser(userId: string) {
    const integration = await UserIntegrations.findByUserIdAndProvider(userId, 'notion')

    if (!integration?.accessToken) {
      throw new Error('Notion token not found')
    }

    return new Client({ auth: integration.accessToken })
  }

  async getCurrentUser(userId: string) {
    const notion = await this.getClientForUser(userId)
    return await notion.users.me({})
  }

  async searchPages(userId: string, query: string) {
    const notion = await this.getClientForUser(userId)
    return await notion.search({
      query,
      filter: { value: 'page', property: 'object' },
    })
  }

  private async saveIntegration(userId: string, accessToken: string) {
    const existing = await UserIntegrations.findByUserIdAndProvider(userId, 'notion')

    if (!existing) {
      return await UserIntegrations.createUser({
        userId,
        accessToken,
        refreshToken: '',
        provider: 'notion',
      })
    }

    await UserIntegrations.updateByUserIdAndProvider(userId, 'notion', {
      accessToken,
    })
  }

  private async exchangeCode(code: string) {
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

export default new NotionService()
