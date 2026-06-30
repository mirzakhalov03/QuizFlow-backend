import { describe, expect, it } from 'vitest'

import { buildAiQuizOutputSchema } from '../../src/validators/aiQuizOutput.schema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeOption = (
  overrides: Partial<{ text: string; isCorrect: boolean; explanation: string }> = {},
) => ({
  text: 'Option text',
  isCorrect: false,
  explanation: 'Some explanation',
  ...overrides,
})

const makeMcQuestion = (optionCount = 4) => ({
  text: 'What is the capital of France?',
  type: 'multiple_choice' as const,
  options: [
    makeOption({ isCorrect: true }),
    ...Array.from({ length: optionCount - 1 }, () => makeOption()),
  ],
})

const makeMsQuestion = (optionCount = 4) => ({
  text: 'Which are prime numbers?',
  type: 'multi_select' as const,
  options: [
    makeOption({ isCorrect: true }),
    makeOption({ isCorrect: true }),
    ...Array.from({ length: optionCount - 2 }, () => makeOption()),
  ],
})

const makeTrueFalseQuestion = (correctText: 'True' | 'False' = 'True') => ({
  text: 'The Earth is flat.',
  type: 'true_false' as const,
  options: [
    makeOption({ text: 'True', isCorrect: correctText === 'True' }),
    makeOption({ text: 'False', isCorrect: correctText === 'False' }),
  ],
})

const makeOpenEndedQuestion = () => ({
  text: 'Explain photosynthesis.',
  type: 'open_ended' as const,
  options: [makeOption({ isCorrect: true, text: 'A concise model answer.' })],
})

const makeValidQuiz = (questions: unknown[]) => ({
  title: 'Test Quiz',
  questions,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildAiQuizOutputSchema', () => {
  // -------------------------------------------------------------------------
  // Happy-path: one passing case per question type
  // -------------------------------------------------------------------------

  describe('valid quizzes pass', () => {
    it('accepts a valid multiple_choice quiz', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 2,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeMcQuestion(4), makeMcQuestion(4)])
      expect(schema.safeParse(quiz).success).toBe(true)
    })

    it('accepts a valid multi_select quiz', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multi_select',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeMsQuestion(4)])
      expect(schema.safeParse(quiz).success).toBe(true)
    })

    it('accepts a valid true_false quiz', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'true_false',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeTrueFalseQuestion()])
      expect(schema.safeParse(quiz).success).toBe(true)
    })

    it('accepts a valid open_ended quiz', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'open_ended',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeOpenEndedQuestion()])
      expect(schema.safeParse(quiz).success).toBe(true)
    })

    it('accepts a valid mixed quiz', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'mixed',
        questionCount: 4,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([
        makeMcQuestion(4),
        makeMsQuestion(4),
        makeTrueFalseQuestion(),
        makeOpenEndedQuestion(),
      ])
      expect(schema.safeParse(quiz).success).toBe(true)
    })

    it('accepts a custom optionsPerQuestion of 6', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 6,
      })
      const quiz = makeValidQuiz([makeMcQuestion(6)])
      expect(schema.safeParse(quiz).success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Question count enforcement
  // -------------------------------------------------------------------------

  describe('question count', () => {
    it('rejects when fewer questions than requested', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 5,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeMcQuestion(4), makeMcQuestion(4)])
      const result = schema.safeParse(quiz)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join(' ')
        expect(messages).toMatch(/5/)
      }
    })

    it('rejects when more questions than requested', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeMcQuestion(4), makeMcQuestion(4)])
      expect(schema.safeParse(quiz).success).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Question type enforcement
  // -------------------------------------------------------------------------

  describe('question type enforcement', () => {
    it('rejects a question with the wrong type in a non-mixed quiz', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 2,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([
        makeMcQuestion(4),
        { ...makeOpenEndedQuestion(), type: 'open_ended' }, // wrong type
      ])
      const result = schema.safeParse(quiz)
      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'))
        expect(paths.some((p) => p.includes('type'))).toBe(true)
      }
    })

    it('rejects a question with an invalid type value in a mixed quiz', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'mixed',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([{ ...makeMcQuestion(4), type: 'mixed' }]) // "mixed" is not a valid question-level type
      expect(schema.safeParse(quiz).success).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Option count enforcement
  // -------------------------------------------------------------------------

  describe('option count', () => {
    it('rejects multiple_choice with wrong option count', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeMcQuestion(3)]) // 3 instead of 4
      const result = schema.safeParse(quiz)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join(' ')
        expect(messages).toMatch(/4 options/)
      }
    })

    it('rejects multi_select with wrong option count', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multi_select',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([makeMsQuestion(5)]) // 5 instead of 4
      expect(schema.safeParse(quiz).success).toBe(false)
    })

    it('rejects true_false with extra options', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'true_false',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([
        {
          text: 'Is sky blue?',
          type: 'true_false',
          options: [
            makeOption({ text: 'True', isCorrect: true }),
            makeOption({ text: 'False', isCorrect: false }),
            makeOption({ text: 'Maybe', isCorrect: false }),
          ],
        },
      ])
      expect(schema.safeParse(quiz).success).toBe(false)
    })

    it('rejects open_ended with multiple options', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'open_ended',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([
        {
          text: 'Explain gravity.',
          type: 'open_ended',
          options: [makeOption({ isCorrect: true }), makeOption({ isCorrect: false })],
        },
      ])
      expect(schema.safeParse(quiz).success).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // isCorrect invariant enforcement
  // -------------------------------------------------------------------------

  describe('isCorrect invariants', () => {
    it('rejects multiple_choice with zero correct options', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([
        {
          text: 'Question?',
          type: 'multiple_choice',
          options: Array.from({ length: 4 }, () => makeOption({ isCorrect: false })),
        },
      ])
      const result = schema.safeParse(quiz)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join(' ')
        expect(messages).toMatch(/1 correct/)
      }
    })

    it('rejects true_false with wrong option text', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'true_false',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([
        {
          text: 'Is water wet?',
          type: 'true_false',
          options: [
            makeOption({ text: 'Yes', isCorrect: true }),
            makeOption({ text: 'No', isCorrect: false }),
          ],
        },
      ])
      const result = schema.safeParse(quiz)
      expect(result.success).toBe(false)
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join(' ')
        expect(messages).toMatch(/"True" and "False"/)
      }
    })

    it('rejects open_ended with isCorrect=false on the model answer', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'open_ended',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([
        {
          text: 'Explain entropy.',
          type: 'open_ended',
          options: [makeOption({ isCorrect: false, text: 'Model answer here.' })],
        },
      ])
      const result = schema.safeParse(quiz)
      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'))
        expect(paths.some((p) => p.includes('isCorrect'))).toBe(true)
      }
    })
  })

  // -------------------------------------------------------------------------
  // Non-empty string enforcement
  // -------------------------------------------------------------------------

  describe('non-empty string fields', () => {
    it('rejects a question with an empty text', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = makeValidQuiz([{ ...makeMcQuestion(4), text: '' }])
      expect(schema.safeParse(quiz).success).toBe(false)
    })

    it('rejects an option with an empty text', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const q = makeMcQuestion(4)
      q.options[0] = { ...q.options[0], text: '' }
      expect(schema.safeParse(makeValidQuiz([q])).success).toBe(false)
    })

    it('rejects an option with an empty explanation', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const q = makeMcQuestion(4)
      q.options[0] = { ...q.options[0], explanation: '' }
      expect(schema.safeParse(makeValidQuiz([q])).success).toBe(false)
    })

    it('rejects a quiz with an empty title', () => {
      const schema = buildAiQuizOutputSchema({
        type: 'multiple_choice',
        questionCount: 1,
        optionsPerQuestion: 4,
      })
      const quiz = { title: '', questions: [makeMcQuestion(4)] }
      expect(schema.safeParse(quiz).success).toBe(false)
    })
  })
})
