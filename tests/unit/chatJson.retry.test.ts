/**
 * Tests for chatJSON's rescue-retry behaviour when an Anthropic model returns
 * non-JSON or markdown-wrapped output.
 *
 * The openai package is mocked via vi.mock so no real HTTP calls are made.
 * The `create` spy is exposed through a module-level ref set inside the mock factory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Shared spy ref — populated by the vi.mock factory below.
// ---------------------------------------------------------------------------

vi.mock('openai', () => {
  // Create the spy here so it lives inside the mock module's scope.
  const spy = vi.fn()

  class FakeAPIError extends Error {
    status: number
    error: unknown
    constructor(msg: string, status: number) {
      super(msg)
      this.status = status
      this.error = {}
    }
  }

  function FakeOpenAI() {
    return {
      chat: { completions: { create: spy } },
    }
  }

  // @ts-expect-error attach static so instanceof checks work
  FakeOpenAI.APIError = FakeAPIError

  // Expose the spy so tests can control it.
  ;(globalThis as Record<string, unknown>).__openaiCreateSpy = spy

  return { default: FakeOpenAI }
})

// Import the client AFTER the mock is registered.
const { chatJSON } = await import('../../src/services/clients/openrouter.client')

// Grab the spy reference that the mock factory stored.
const createSpy = (globalThis as Record<string, unknown>).__openaiCreateSpy as ReturnType<
  typeof vi.fn
>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeCompletion = (content: string) => ({
  choices: [{ message: { content } }],
  usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
})

const validJson = '{"title":"Quiz","questions":[]}'

const baseOptions = {
  model: 'anthropic/claude-3-5-sonnet', // json_object model
  schema: { name: 'quiz', schema: { type: 'object' } },
  messages: [{ role: 'user' as const, content: 'Generate a quiz.' }],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chatJSON — Anthropic (json_object) rescue-retry', () => {
  beforeEach(() => {
    createSpy.mockReset()
    process.env.OPENROUTER_API_KEY = 'test-key'
  })

  it('returns immediately when the model returns clean JSON (1 call)', async () => {
    createSpy.mockResolvedValueOnce(makeCompletion(validJson))

    const result = await chatJSON(baseOptions)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.data).toEqual({ title: 'Quiz', questions: [] })
  })

  it('extracts JSON wrapped in a markdown fence without a retry', async () => {
    createSpy.mockResolvedValueOnce(makeCompletion('```json\n' + validJson + '\n```'))

    const result = await chatJSON(baseOptions)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.data).toEqual({ title: 'Quiz', questions: [] })
  })

  it('extracts JSON buried in prose without a retry', async () => {
    createSpy.mockResolvedValueOnce(
      makeCompletion(`Here is your quiz: ${validJson} Hope it helps!`),
    )

    const result = await chatJSON(baseOptions)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.data).toEqual({ title: 'Quiz', questions: [] })
  })

  it('fires a rescue retry when all extraction strategies fail on attempt 1', async () => {
    createSpy
      .mockResolvedValueOnce(makeCompletion('I cannot produce JSON right now.'))
      .mockResolvedValueOnce(makeCompletion(validJson))

    const result = await chatJSON(baseOptions)

    expect(createSpy).toHaveBeenCalledTimes(2)
    expect(result.data).toEqual({ title: 'Quiz', questions: [] })
  })

  it('rescue retry message contains "previous response" language', async () => {
    createSpy
      .mockResolvedValueOnce(makeCompletion('Not JSON at all.'))
      .mockResolvedValueOnce(makeCompletion(validJson))

    await chatJSON(baseOptions)

    const retryMessages: { role: string; content: unknown }[] = createSpy.mock.calls[1][0].messages
    const retryText = retryMessages
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n')

    expect(retryText).toMatch(/previous response/i)
  })

  it("rescue retry messages include the model's bad response as an assistant turn", async () => {
    const badResponse = 'Not JSON at all.'
    createSpy
      .mockResolvedValueOnce(makeCompletion(badResponse))
      .mockResolvedValueOnce(makeCompletion(validJson))

    await chatJSON(baseOptions)

    const retryMessages: { role: string; content: unknown }[] = createSpy.mock.calls[1][0].messages
    const assistantTurn = retryMessages.find((m) => m.role === 'assistant')
    expect(assistantTurn?.content).toBe(badResponse)
  })

  it('throws OPENROUTER_PARSE_ERROR after both attempts produce unparseable output', async () => {
    createSpy
      .mockResolvedValueOnce(makeCompletion('No JSON here.'))
      .mockResolvedValueOnce(makeCompletion('Still no JSON.'))

    await expect(chatJSON(baseOptions)).rejects.toMatchObject({
      code: 'OPENROUTER_PARSE_ERROR',
      statusCode: 502,
    })

    expect(createSpy).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry for json_schema-capable models (single call only)', async () => {
    createSpy.mockResolvedValueOnce(makeCompletion('not json'))

    await expect(chatJSON({ ...baseOptions, model: 'openai/gpt-4o' })).rejects.toMatchObject({
      code: 'OPENROUTER_PARSE_ERROR',
    })

    expect(createSpy).toHaveBeenCalledTimes(1)
  })
})
