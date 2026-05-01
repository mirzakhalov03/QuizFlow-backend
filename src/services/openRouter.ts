import { AppError } from '../helpers/AppError'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type JsonSchema = {
  name: string
  schema: Record<string, unknown>
  strict?: boolean
}

export type ChatJsonOptions = {
  model: string
  messages: ChatMessage[]
  schema: JsonSchema
  apiKey?: string
  temperature?: number
}

const getApiKey = (override?: string): string => {
  const key = override ?? process.env.OPENROUTER_API_KEY

  if (!key) {
    throw new AppError('OPENROUTER_API_KEY is not configured', 500, 'CONFIG_ERROR')
  }

  return key
}

export const chatJSON = async <T>(options: ChatJsonOptions): Promise<T> => {
  const apiKey = getApiKey(options.apiKey)

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
      'X-Title': 'QuizFlow',
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.4,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: options.schema.name,
          strict: options.schema.strict ?? true,
          schema: options.schema.schema,
        },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new AppError(
      `OpenRouter request failed (${response.status})`,
      502,
      'OPENROUTER_ERROR',
      body,
    )
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
  }

  const content = payload.choices?.[0]?.message?.content

  if (!content) {
    throw new AppError(
      'OpenRouter returned an empty response',
      502,
      'OPENROUTER_EMPTY_RESPONSE',
      payload,
    )
  }

  try {
    return JSON.parse(content) as T
  } catch (error) {
    throw new AppError('OpenRouter returned non-JSON content', 502, 'OPENROUTER_PARSE_ERROR', {
      content,
      error,
    })
  }
}
