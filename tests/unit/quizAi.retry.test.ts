/**
 * Tests for the validation + retry logic inside generateQuizFromText.
 *
 * chatJSON is mocked so no real HTTP requests are made.
 * Each test controls exactly what the "AI" returns per attempt and asserts
 * on the number of calls made and the data / error produced.
 */
import { describe, it, vi, beforeEach, expect } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import { generateQuizFromText } from '../../src/services/helpers/quizAi'

// ---------------------------------------------------------------------------
// Mock chatJSON BEFORE any imports resolve it
// ---------------------------------------------------------------------------
const { chatJSONMock } = vi.hoisted(() => ({ chatJSONMock: vi.fn() }))

vi.mock('../../src/services/clients/openrouter.client', () => ({
  chatJSON: chatJSONMock,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeOption = (isCorrect = false) => ({
  text: 'Option text',
  isCorrect,
  explanation: 'Explanation here.',
})

/** A valid multiple_choice quiz with 2 questions and 4 options each */
const validQuiz = {
  title: 'Valid Quiz',
  questions: [
    {
      text: 'Question one?',
      type: 'multiple_choice',
      options: [makeOption(true), makeOption(), makeOption(), makeOption()],
    },
    {
      text: 'Question two?',
      type: 'multiple_choice',
      options: [makeOption(true), makeOption(), makeOption(), makeOption()],
    },
  ],
}

/** A quiz where both questions have only 3 options instead of the required 4 */
const quizWithWrongOptionCount = {
  title: 'Bad Quiz',
  questions: [
    {
      text: 'Question one?',
      type: 'multiple_choice',
      options: [makeOption(true), makeOption(), makeOption()], // 3 instead of 4
    },
    {
      text: 'Question two?',
      type: 'multiple_choice',
      options: [makeOption(true), makeOption(), makeOption()], // 3 instead of 4
    },
  ],
}

/** A quiz with only 1 question instead of the requested 2 */
const quizWithWrongCount = {
  title: 'Short Quiz',
  questions: [
    {
      text: 'Only question?',
      type: 'multiple_choice',
      options: [makeOption(true), makeOption(), makeOption(), makeOption()],
    },
  ],
}

const wrapResult = (
  data: unknown,
  usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
) => Promise.resolve({ data, usage })

const sources = [{ kind: 'text' as const, text: 'Some source material about history.' }]

const opts = {
  sources,
  questionCount: 2,
  type: 'multiple_choice' as const,
  optionsPerQuestion: 4,
  model: 'openai/gpt-4o-mini',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateQuizFromText — validation + retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Scenario 1: Model returns a valid quiz on the first attempt
  // -------------------------------------------------------------------------
  it('returns immediately when the first response is valid (1 chatJSON call)', async () => {
    chatJSONMock.mockReturnValueOnce(wrapResult(validQuiz))

    const result = await generateQuizFromText(opts)

    expect(chatJSONMock).toHaveBeenCalledTimes(1)
    expect(result.quiz.questions).toHaveLength(2)
    expect(result.quiz.title).toBe('Valid Quiz')
  })

  // -------------------------------------------------------------------------
  // Scenario 2: Model returns bad data once, then a valid quiz on retry
  // -------------------------------------------------------------------------
  it('retries when the first response is invalid and succeeds on attempt 2', async () => {
    chatJSONMock
      .mockReturnValueOnce(wrapResult(quizWithWrongOptionCount)) // attempt 1 — invalid
      .mockReturnValueOnce(wrapResult(validQuiz)) // attempt 2 — valid

    const result = await generateQuizFromText(opts)

    // Must have called the model exactly twice
    expect(chatJSONMock).toHaveBeenCalledTimes(2)
    expect(result.quiz.questions).toHaveLength(2)

    // The second call should include the correction message in the messages array
    const secondCallMessages: { role: string; content: unknown }[] =
      chatJSONMock.mock.calls[1][0].messages
    const correctionMsg = secondCallMessages.find(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('violated the quiz generation rules'),
    )
    expect(correctionMsg).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Scenario 3: Model returns bad data on attempt 1 and 2, valid on attempt 3
  // -------------------------------------------------------------------------
  it('retries twice and succeeds on the third attempt', async () => {
    chatJSONMock
      .mockReturnValueOnce(wrapResult(quizWithWrongOptionCount)) // attempt 1 — invalid
      .mockReturnValueOnce(wrapResult(quizWithWrongCount)) // attempt 2 — invalid
      .mockReturnValueOnce(wrapResult(validQuiz)) // attempt 3 — valid

    const result = await generateQuizFromText(opts)

    expect(chatJSONMock).toHaveBeenCalledTimes(3)
    expect(result.quiz.title).toBe('Valid Quiz')
  })

  // -------------------------------------------------------------------------
  // Scenario 4: Model never produces a valid quiz — should throw AI_OUTPUT_INVALID
  // -------------------------------------------------------------------------
  it('throws AppError(AI_OUTPUT_INVALID) after all 3 attempts fail', async () => {
    chatJSONMock
      .mockReturnValueOnce(wrapResult(quizWithWrongOptionCount)) // attempt 1 — invalid
      .mockReturnValueOnce(wrapResult(quizWithWrongOptionCount)) // attempt 2 — invalid
      .mockReturnValueOnce(wrapResult(quizWithWrongOptionCount)) // attempt 3 — invalid

    await expect(generateQuizFromText(opts)).rejects.toMatchObject({
      code: 'AI_OUTPUT_INVALID',
      statusCode: 502,
    })

    // All 3 attempts should have been made before giving up
    expect(chatJSONMock).toHaveBeenCalledTimes(3)
  })

  // -------------------------------------------------------------------------
  // Scenario 5: Error message includes what went wrong
  // -------------------------------------------------------------------------
  it('error message describes the violated constraints', async () => {
    chatJSONMock.mockResolvedValue(wrapResult(quizWithWrongOptionCount))

    let thrownError: AppError | null = null
    try {
      await generateQuizFromText(opts)
    } catch (err) {
      thrownError = err as AppError
    }

    expect(thrownError).toBeInstanceOf(AppError)
    expect(thrownError!.message).toMatch(/3 attempts/)
    // The error should reference the option count problem
    expect(thrownError!.message.toLowerCase()).toMatch(/options/)
  })

  // -------------------------------------------------------------------------
  // Scenario 6: Verify the correction message contains the Zod issue details
  // -------------------------------------------------------------------------
  it('correction prompt contains the exact field path and issue message', async () => {
    chatJSONMock
      .mockReturnValueOnce(wrapResult(quizWithWrongOptionCount))
      .mockReturnValueOnce(wrapResult(validQuiz))

    await generateQuizFromText(opts)

    const secondCallMessages: { role: string; content: unknown }[] =
      chatJSONMock.mock.calls[1][0].messages
    const correctionContent = secondCallMessages
      .filter((m) => m.role === 'user' && typeof m.content === 'string')
      .map((m) => m.content as string)
      .join('\n')

    // Should mention an options path
    expect(correctionContent).toMatch(/options/)
    // Should mention the expected count of 4
    expect(correctionContent).toMatch(/4/)
  })
})
