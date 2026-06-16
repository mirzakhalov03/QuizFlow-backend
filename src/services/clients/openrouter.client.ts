import OpenAI from 'openai'

import { logger } from '../../config/logger'
import { AppError } from '../../helpers/AppError'

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
  timeoutMs?: number
  maxRetries?: number
}

const getClient = (apiKey?: string) => {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY

  if (!key) {
    throw new AppError('OPENROUTER_API_KEY is not configured', 500, 'CONFIG_ERROR')
  }

  return new OpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
      'X-Title': 'QuizFlow',
    },
  })
}

export type ChatJsonResult<T> = {
  data: T
  usage?: OpenAI.CompletionUsage
}

export const chatJSON = async <T>(options: ChatJsonOptions): Promise<ChatJsonResult<T>> => {
  const client = getClient(options.apiKey)

  let completion: OpenAI.ChatCompletion

  try {
    completion = await client.chat.completions.create(
      {
        model: options.model,
        temperature: options.temperature ?? 0.4,
        messages: options.messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: options.schema.name,
            strict: options.schema.strict ?? true,
            schema: options.schema.schema,
          },
        },
      },
      // undefined falls back to the client defaults inside the SDK.
      { timeout: options.timeoutMs, maxRetries: options.maxRetries },
    )
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      logger.error('OpenRouter API error', {
        status: err.status,
        message: err.message,
        error: err.error,
      })
      throw new AppError(
        `OpenRouter request failed (${err.status})`,
        502,
        'OPENROUTER_ERROR',
        err.message,
      )
    }
    throw err
  }

  const content = completion.choices[0]?.message?.content

  if (!content) {
    throw new AppError(
      'OpenRouter returned an empty response',
      502,
      'OPENROUTER_EMPTY_RESPONSE',
      completion,
    )
  }

  try {
    return {
      data: JSON.parse(content) as T,
      usage: completion.usage,
    }
  } catch (error) {
    throw new AppError('OpenRouter returned non-JSON content', 502, 'OPENROUTER_PARSE_ERROR', {
      content,
      error,
    })
  }
}
