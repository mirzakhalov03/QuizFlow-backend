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

/**
 * Attempt to extract a valid JSON object string from raw model output.
 *
 * Strategy (applied in order until one succeeds):
 *  1. Strip a wrapping markdown code fence (``` or ```json) and try to parse.
 *  2. Search for ANY ```json ... ``` or ``` ... ``` block anywhere in the text
 *     and try each match in order.
 *  3. Find the first `{` in the text and walk forward matching braces to
 *     extract the outermost JSON object.
 *
 * Returns the trimmed raw string of the best candidate, or the original
 * trimmed string if nothing better is found (so the caller's JSON.parse can
 * produce a meaningful error).
 */
export const extractJsonString = (content: string): string => {
  const trimmed = content.trim()

  // ── Strategy 1: entire content is a single code fence ──────────────────
  const wholeFenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)
  if (wholeFenceMatch) {
    const candidate = wholeFenceMatch[1].trim()
    if (isLikelyJson(candidate)) return candidate
  }

  // ── Strategy 2: find a ```json``` block embedded anywhere in prose ──────────
  // Deliberately only matches ```json (not plain ``` or ```javascript etc.) so
  // that inner code-block fences inside question/option text strings are never
  // mistaken for the outer JSON wrapper.
  const embeddedFencePattern = /```json\s*\n?([\s\S]*?)\n?```/gi
  let match: RegExpExecArray | null
  while ((match = embeddedFencePattern.exec(trimmed)) !== null) {
    const candidate = match[1].trim()
    if (isLikelyJson(candidate)) return candidate
  }

  // ── Strategy 3: extract outermost {...} or [...] by bracket-walking ───────
  // Supports both JSON objects and top-level JSON arrays.
  const objectStart = trimmed.indexOf('{')
  const arrayStart = trimmed.indexOf('[')
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart)

  if (start !== -1) {
    const openBracket = trimmed[start]
    const closeBracket = openBracket === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escape = false

    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i]

      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\' && inString) {
        escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue

      if (ch === openBracket) depth++
      else if (ch === closeBracket) {
        depth--
        if (depth === 0) {
          const candidate = trimmed.slice(start, i + 1)
          if (isLikelyJson(candidate)) return candidate
          break
        }
      }
    }
  }

  // Nothing better found — return as-is so JSON.parse gives a real error.
  return trimmed
}

/**
 * Quick heuristic: does this string look like a JSON object or array?
 *
 * NOTE: This intentionally does NOT call JSON.parse to avoid double-parsing
 * on the hot path. It can pass for malformed strings like `{ garbage }` —
 * callers that need strict validation should parse the candidate themselves.
 */
const isLikelyJson = (s: string): boolean =>
  (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))

export type ChatJsonOptions = {
  model: string
  messages: ChatMessage[]
  schema: JsonSchema
  apiKey?: string
  temperature?: number
  timeoutMs?: number
  maxRetries?: number
}

/** Cache of OpenAI client instances keyed by API key to avoid re-allocating per request. */
const clientCache = new Map<string, OpenAI>()

const getClient = (apiKey?: string) => {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY

  if (!key) {
    throw new AppError('OPENROUTER_API_KEY is not configured', 500, 'CONFIG_ERROR')
  }

  if (clientCache.has(key)) return clientCache.get(key)!

  const client = new OpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
      'X-Title': process.env.APP_TITLE ?? 'QuizFlow',
    },
  })

  clientCache.set(key, client)
  return client
}

export type ChatJsonResult<T> = {
  data: T
  usage?: OpenAI.CompletionUsage
}

/**
 * Build the JSON-enforcement instruction injected into the user message for
 * models that don't support response_format: json_schema.
 */
const buildJsonInstruction = (schema: JsonSchema, isRetry = false): string => {
  const prefix = isRetry ? 'IMPORTANT: Your previous response could not be parsed as JSON. ' : ''
  return (
    `${prefix}Respond with ONLY valid raw JSON (no markdown, no code fences, no explanatory text) ` +
    `that strictly matches this JSON schema:\n` +
    JSON.stringify(schema.schema, null, 2)
  )
}

/**
 * Append or replace the JSON instruction on the last user message.
 * When `replace` is true the old instruction text is overwritten (for retries).
 */
const injectJsonInstruction = (messages: ChatMessage[], instruction: string): ChatMessage[] => {
  const updated = [...messages]
  const lastMessage = updated[updated.length - 1]

  if (lastMessage && lastMessage.role === 'user') {
    const updatedLast = { ...lastMessage }
    if (typeof updatedLast.content === 'string') {
      updatedLast.content = `${updatedLast.content}\n\n${instruction}`
    } else if (Array.isArray(updatedLast.content)) {
      updatedLast.content = [...updatedLast.content, { type: 'text', text: instruction }]
    } else {
      updatedLast.content = instruction
    }
    updated[updated.length - 1] = updatedLast as ChatMessage
  } else {
    updated.push({ role: 'user', content: instruction } satisfies ChatMessage)
  }

  return updated
}

/** Make a single completion request and return the raw content string. */
const fetchCompletion = async (
  client: OpenAI,
  options: ChatJsonOptions,
  messages: ChatMessage[],
  responseFormat: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming['response_format'],
  requestOptions: { timeout?: number; maxRetries?: number },
): Promise<OpenAI.ChatCompletion> => {
  try {
    return await client.chat.completions.create(
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
}

/** Try to parse JSON from a completion's content. Returns null on failure. */
const tryParseContent = <T>(completion: OpenAI.ChatCompletion): T | null => {
  const raw = completion.choices[0]?.message?.content
  if (!raw) return null

  const extracted = extractJsonString(raw)
  try {
    return JSON.parse(extracted) as T
  } catch {
    return null
  }
}

export const chatJSON = async <T>(options: ChatJsonOptions): Promise<ChatJsonResult<T>> => {
  const client = getClient(options.apiKey)

  const requestOptions: { timeout?: number; maxRetries?: number } = {}
  if (options.timeoutMs !== undefined) requestOptions.timeout = options.timeoutMs
  if (options.maxRetries !== undefined) requestOptions.maxRetries = options.maxRetries

  const useJsonSchema = supportsJsonSchema(options.model)

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

  // ── json_schema path (OpenAI-compatible models) ─────────────────────────
  // The schema is enforced by the API itself, so a single call is sufficient.
  if (useJsonSchema) {
    const completion = await fetchCompletion(
      client,
      options,
      options.messages,
      responseFormat,
      requestOptions,
    )

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
      // NOTE: json_schema path skips extractJsonString intentionally — the API
      // enforces the schema so the content is guaranteed to be clean JSON.
      return { data: JSON.parse(content) as T, usage: completion.usage }
    } catch (error) {
      throw new AppError('OpenRouter returned non-JSON content', 502, 'OPENROUTER_PARSE_ERROR', {
        content,
        error,
      })
    }
  }

  // ── json_object fallback path (Anthropic and similar) ───────────────────
  // These models ignore response_format enforcement and may wrap their output
  // in markdown or prose.  We:
  //   1. Inject a strict JSON instruction into the last user message.
  //   2. Call the model and attempt multi-strategy JSON extraction.
  //   3. On parse failure, do ONE rescue retry with a stronger instruction
  //      that includes the model's offending response so it can self-correct.

  const firstMessages = injectJsonInstruction(
    options.messages,
    buildJsonInstruction(options.schema),
  )

  const firstCompletion = await fetchCompletion(
    client,
    options,
    firstMessages,
    responseFormat,
    requestOptions,
  )

  const firstRaw = firstCompletion.choices[0]?.message?.content
  if (!firstRaw) {
    throw new AppError(
      'OpenRouter returned an empty response',
      502,
      'OPENROUTER_EMPTY_RESPONSE',
      firstCompletion,
    )
  }

  const firstParsed = tryParseContent<T>(firstCompletion)
  if (firstParsed !== null) {
    return { data: firstParsed, usage: firstCompletion.usage }
  }

  // ── Rescue retry ─────────────────────────────────────────────────────────
  logger.warn('[openrouter] json_object model returned non-JSON; retrying with stronger prompt', {
    model: options.model,
    rawLength: firstRaw.length,
    preview: firstRaw.slice(0, 200),
  })

  const retryMessages: ChatMessage[] = [
    ...firstMessages,
    // Preserve the model's bad response so it can see its own mistake.
    { role: 'assistant', content: firstRaw },
    {
      role: 'user',
      content: buildJsonInstruction(options.schema, true /* isRetry */),
    },
  ]

  const retryCompletion = await fetchCompletion(
    client,
    options,
    retryMessages,
    responseFormat,
    requestOptions,
  )

  const retryRaw = retryCompletion.choices[0]?.message?.content
  if (!retryRaw) {
    throw new AppError(
      'OpenRouter returned an empty response on retry',
      502,
      'OPENROUTER_EMPTY_RESPONSE',
      retryCompletion,
    )
  }

  const retryParsed = tryParseContent<T>(retryCompletion)
  if (retryParsed !== null) {
    logger.info('[openrouter] json_object rescue retry succeeded', { model: options.model })
    // Merge token usage from both the failed first attempt and the successful retry.
    const mergedUsage: OpenAI.CompletionUsage | undefined =
      firstCompletion.usage && retryCompletion.usage
        ? {
            prompt_tokens:
              firstCompletion.usage.prompt_tokens + retryCompletion.usage.prompt_tokens,
            completion_tokens:
              firstCompletion.usage.completion_tokens + retryCompletion.usage.completion_tokens,
            total_tokens: firstCompletion.usage.total_tokens + retryCompletion.usage.total_tokens,
          }
        : (retryCompletion.usage ?? firstCompletion.usage)
    return { data: retryParsed, usage: mergedUsage }
  }

  // Both attempts failed — the model did not adhere to the JSON schema rules
  // even after an explicit self-correction retry.
  throw new AppError(
    `Model "${options.model}" did not adhere to the required JSON schema after two attempts. ` +
      'Try again or switch to a another model',
    502,
    'OPENROUTER_PARSE_ERROR',
    {
      model: options.model,
      schemaName: options.schema.name,
      firstRaw: firstRaw.slice(0, 500),
      retryRaw: retryRaw.slice(0, 500),
    },
  )
}
