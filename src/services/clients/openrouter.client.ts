import OpenAI from 'openai'

import { logger } from '../../config/logger'
import { AppError } from '../../helpers/AppError'

export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

export type JsonSchema = {
  name: string
  schema: Record<string, unknown>
  strict?: boolean
}

/**
 * Models that do NOT support OpenAI-style `response_format: json_schema`.
 * For these we fall back to prompt-based JSON enforcement.
 */
const JSON_SCHEMA_UNSUPPORTED_PREFIXES = ['anthropic/'] as const

const supportsJsonSchema = (model: string): boolean =>
  !JSON_SCHEMA_UNSUPPORTED_PREFIXES.some((prefix) => model.startsWith(prefix))

/** Strip markdown code fences that some models wrap around JSON output. */
const stripMarkdownFences = (content: string): string => {
  const trimmed = content.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
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

  // Only set these when provided. The SDK validates `timeout` whenever the key
  // is *present* (`'timeout' in options`), so passing `timeout: undefined`
  // throws "timeout must be an integer" instead of falling back to the default.
  const requestOptions: { timeout?: number; maxRetries?: number } = {}
  if (options.timeoutMs !== undefined) requestOptions.timeout = options.timeoutMs
  if (options.maxRetries !== undefined) requestOptions.maxRetries = options.maxRetries

  const useJsonSchema = supportsJsonSchema(options.model)
  // For models that don't support json_schema, inject a JSON instruction so
  // they know to respond with raw JSON matching the schema.
  const messages: ChatMessage[] = [...options.messages]
  if (!useJsonSchema) {
    const instruction =
      'Respond with ONLY valid raw JSON (no markdown, no code fences) that strictly matches this JSON schema:\n' +
      JSON.stringify(options.schema.schema, null, 2)

    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.role === 'user') {
      const updatedLast = { ...lastMessage }
      if (typeof updatedLast.content === 'string') {
        updatedLast.content = `${updatedLast.content}\n\n${instruction}`
      } else if (Array.isArray(updatedLast.content)) {
        updatedLast.content = [...updatedLast.content, { type: 'text', text: instruction }]
      } else {
        updatedLast.content = instruction
      }
      messages[messages.length - 1] = updatedLast as ChatMessage
    } else {
      messages.push({
        role: 'user',
        content: instruction,
      } satisfies ChatMessage)
    }
  }
  const responseFormat: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming['response_format'] =
    useJsonSchema
      ? {
          type: 'json_schema',
          json_schema: {
            name: options.schema.name,
            strict: options.schema.strict ?? true,
            schema: options.schema.schema,
          },
        }
      : { type: 'json_object' }

  try {
    completion = await client.chat.completions.create(
      {
        model: options.model,
        temperature: options.temperature ?? 0.4,
        messages,
        response_format: responseFormat,
      },
      requestOptions,
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

  const sanitizedContent = stripMarkdownFences(content)

  try {
    return {
      data: JSON.parse(sanitizedContent) as T,
      usage: completion.usage,
    }
  } catch (error) {
    throw new AppError('OpenRouter returned non-JSON content', 502, 'OPENROUTER_PARSE_ERROR', {
      content: sanitizedContent,
      error,
    })
  }
}
