import { Client, isFullBlock, isNotionClientError, APIResponseError } from '@notionhq/client'
import type {
  PageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'

import { logger } from '../config/logger'
import UserIntegrations from '../models/userIntegration.model'

type NotionPage = {
  id: string
  title: string
  icon?: string
}

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

    return new Client({
      auth: integration.accessToken,
      timeoutMs: 30000,
    })
  }

  async getCurrentUser(userId: string) {
    const notion = await this.getClientForUser(userId)
    return this.withRetry(() => notion.users.me({}))
  }

  async searchPages(userId: string, query: string) {
    const notion = await this.getClientForUser(userId)
    return this.withRetry(() =>
      notion.search({
        query,
        filter: { value: 'page', property: 'object' },
      }),
    )
  }

  async getAccessiblePages(userId: string): Promise<NotionPage[]> {
    const notion = await this.getClientForUser(userId)

    const searchResults = await this.withRetry(() =>
      notion.search({
        filter: { value: 'page', property: 'object' },
        page_size: 100,
      }),
    )

    return searchResults.results
      .filter((result): result is PageObjectResponse => 'properties' in result)
      .map((page) => {
        // Find the property of type 'title' (Notion pages always have exactly one)
        const titleProp = Object.values(page.properties).find((prop) => prop.type === 'title') as
          Extract<PageObjectResponse['properties'][string], { type: 'title' }> | undefined

        const title = titleProp?.title?.[0]?.plain_text || 'Untitled'

        return {
          id: page.id,
          title,
          icon: page.icon?.type === 'emoji' ? page.icon.emoji : undefined,
        }
      })
  }

  async getPageContent(userId: string, pageId: string): Promise<string> {
    const notion = await this.getClientForUser(userId)
    const content: string[] = []
    const state = { bytes: 0 }
    await this.fetchBlocksContent(notion, pageId, content, state, 0)
    return content.join('\n')
  }

  private readonly MAX_CONTENT_BYTES = 15 * 1024 * 1024

  private push(content: string[], state: { bytes: number }, text: string) {
    content.push(text)
    state.bytes += Buffer.byteLength(text, 'utf8')
  }

  private extractRichText(richText: Array<{ plain_text: string }>): string {
    return richText.map((t) => t.plain_text).join('')
  }

  private extractBlockText(block: BlockObjectResponse): string {
    switch (block.type) {
      case 'paragraph':
        return this.extractRichText(block.paragraph.rich_text)
      case 'heading_1':
        return `# ${this.extractRichText(block.heading_1.rich_text)}`
      case 'heading_2':
        return `## ${this.extractRichText(block.heading_2.rich_text)}`
      case 'heading_3':
        return `### ${this.extractRichText(block.heading_3.rich_text)}`
      case 'bulleted_list_item':
        return `- ${this.extractRichText(block.bulleted_list_item.rich_text)}`
      case 'numbered_list_item':
        return this.extractRichText(block.numbered_list_item.rich_text)
      case 'quote':
        return `> ${this.extractRichText(block.quote.rich_text)}`
      case 'callout':
        return this.extractRichText(block.callout.rich_text)
      case 'to_do':
        return `${block.to_do.checked ? '[x]' : '[ ]'} ${this.extractRichText(block.to_do.rich_text)}`
      case 'code':
        return `\`\`\`${block.code.language}\n${this.extractRichText(block.code.rich_text)}\n\`\`\``
      case 'equation':
        return block.equation.expression
      default:
        return ''
    }
  }

  private async fetchBlocksContent(
    notion: Client,
    blockId: string,
    content: string[],
    state: { bytes: number },
    depth: number,
  ): Promise<void> {
    if (state.bytes >= this.MAX_CONTENT_BYTES || depth > 3) return

    const blocks = await this.withRetry(() =>
      notion.blocks.children.list({ block_id: blockId, page_size: 100 }),
    )

    for (const block of blocks.results) {
      if (!isFullBlock(block) || state.bytes >= this.MAX_CONTENT_BYTES) break

      if (block.type === 'child_database') {
        this.push(content, state, `## ${block.child_database.title || 'Untitled Database'}`)
        try {
          const notionAny = notion as unknown as {
            request: (args: Record<string, unknown>) => Promise<{ results: unknown[] }>
          }
          const rows = await this.withRetry(() =>
            notionAny.request({
              path: `databases/${block.id}/query`,
              method: 'POST',
              query: { page_size: 100 },
              body: {},
            }),
          )
          for (const row of rows.results) {
            if (state.bytes >= this.MAX_CONTENT_BYTES) break
            const rowText = this.formatPageBlock(row)
            if (rowText) this.push(content, state, rowText)
          }
        } catch (err) {
          logger.warn('Failed to fetch Notion database content', {
            databaseId: block.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } else if (block.type === 'child_page') {
        this.push(content, state, '## ' + (block.child_page.title || 'Untitled Subpage'))
        try {
          await this.fetchBlocksContent(notion, block.id, content, state, depth + 1)
        } catch (err) {
          logger.warn('Failed to fetch Notion subpage content', {
            pageId: block.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } else if (block.type === 'table') {
        try {
          const tableRows = await this.withRetry(() =>
            notion.blocks.children.list({ block_id: block.id, page_size: 100 }),
          )
          for (const row of tableRows.results) {
            if (
              !isFullBlock(row) ||
              row.type !== 'table_row' ||
              state.bytes >= this.MAX_CONTENT_BYTES
            )
              continue
            const cells = (row.table_row.cells as Array<Array<{ plain_text: string }>>)
              .map((cell) => cell.map((t) => t.plain_text).join(''))
              .filter(Boolean)
            if (cells.length > 0) this.push(content, state, cells.join(' | '))
          }
        } catch (err) {
          logger.warn('Failed to fetch Notion table content', {
            tableId: block.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      } else if (block.type === 'toggle') {
        const text = this.extractRichText(block.toggle.rich_text)
        if (text) this.push(content, state, text)
        if (block.has_children)
          await this.fetchBlocksContent(notion, block.id, content, state, depth + 1)
      } else if (
        block.type === 'column_list' ||
        block.type === 'column' ||
        block.type === 'synced_block'
      ) {
        if (block.has_children)
          await this.fetchBlocksContent(notion, block.id, content, state, depth + 1)
      } else {
        const text = this.extractBlockText(block)
        if (text) this.push(content, state, text)
      }
    }
  }

  private formatPageBlock(page: unknown): string {
    try {
      if (typeof page !== 'object' || page === null) return ''

      const p = page as Record<string, unknown>

      if (!('properties' in p)) return ''

      const props = p.properties as Record<string, unknown>
      const lines: string[] = []

      for (const [key, value] of Object.entries(props)) {
        if (!value || typeof value !== 'object') continue

        const v = value as Record<string, unknown>

        if (v.type === 'title' && Array.isArray(v.title)) {
          const text = (v.title as Array<{ plain_text?: string }>).map((t) => t.plain_text).join('')
          if (text) lines.push(`**${text}**`)
        } else if (v.type === 'rich_text' && Array.isArray(v.rich_text)) {
          const text = (v.rich_text as Array<{ plain_text?: string }>)
            .map((t) => t.plain_text)
            .join('')
          if (text) lines.push(text)
        } else if (v.type === 'select' && v.select) {
          const sel = v.select as { name?: string }
          if (sel.name) lines.push(`${key}: ${sel.name}`)
        } else if (Array.isArray(v.select) && v.select.length > 0) {
          const names = (v.select as Array<{ name?: string }>).map((s) => s.name).filter(Boolean)
          if (names.length > 0) lines.push(`${key}: ${names.join(', ')}`)
        }
      }

      return lines.join(' | ')
    } catch {
      return ''
    }
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

  /**
   * Helper to retry Notion API calls on transient network failures or rate limits.
   */
  private async withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn()
    } catch (err) {
      const transientCodes = [
        'UND_ERR_CONNECT_TIMEOUT',
        'ETIMEDOUT',
        'ECONNRESET',
        'EADDRINUSE',
        'ECONNREFUSED',
        'ENOTFOUND',
      ]
      const isNetworkError =
        (err instanceof Error &&
          (err.message.includes('fetch failed') ||
            err.message.toLowerCase().includes('timeout') ||
            transientCodes.includes((err as { code?: string }).code || ''))) ||
        (isNotionClientError(err) && err.code === 'notionhq_client_request_timeout')

      const isRateLimit = APIResponseError.isAPIResponseError(err) && err.status === 429

      if ((isNetworkError || isRateLimit) && retries > 0) {
        let retryDelay = delay
        if (isRateLimit && APIResponseError.isAPIResponseError(err)) {
          const headers = err.headers as Record<string, string | undefined> & {
            get?: (key: string) => string | null
          }
          const retryAfterHeader =
            typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after']
          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10)
            if (!isNaN(parsed)) {
              retryDelay = parsed * 1000
            }
          }
        }

        logger.warn('Notion API transient error, retrying... (' + retries + ' left)', {
          error: err instanceof Error ? err.message : String(err),
          cause:
            (err as { cause?: { code?: string } }).cause?.code || (err as { code?: string }).code,
        })
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        return this.withRetry(fn, retries - 1, retryDelay === delay ? delay * 2 : delay)
      }
      throw err
    }
  }
}

export default new NotionService()
