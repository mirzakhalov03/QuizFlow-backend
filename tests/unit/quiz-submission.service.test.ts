import { describe, it, vi, beforeEach, expect } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import { scoreAnswers, submitQuiz } from '../../src/services/quiz-submission.service'
import type { QuestionType } from '../../src/types/questionTypes'

type Question = { id: string; type: QuestionType }
type Option = { id: string; questionId: string; isCorrect: boolean }

// A thenable query-builder mock: every chained call returns the same builder,
// and awaiting it resolves the next value queued in `selectResults` (in call
// order). Lets us drive submitQuiz's sequential db.select(...) reads.
const { dbMock, txMock, selectResults } = vi.hoisted(() => {
  const selectResults: unknown[] = []
  const resultRow = {
    id: 'result-1',
    totalQuestions: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    gradingStatus: 'complete',
  }

  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const m of ['select', 'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) {
    builder[m] = vi.fn(chain)
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve(selectResults.length > 0 ? selectResults.shift() : [])

  const txMock: Record<string, unknown> = {}
  txMock.insert = vi.fn(() => txMock)
  txMock.values = vi.fn(() => txMock)
  txMock.onConflictDoUpdate = vi.fn(() => Promise.resolve())
  txMock.returning = vi.fn(() => Promise.resolve([resultRow]))
  txMock.update = vi.fn(() => txMock)
  txMock.set = vi.fn(() => txMock)
  txMock.where = vi.fn(() => Promise.resolve())

  const dbMock: Record<string, unknown> = {
    select: vi.fn(chain),
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(txMock)),
  }

  return { dbMock, txMock, selectResults }
})

vi.mock('../../src/database/database', () => ({ db: dbMock }))
// Avoid pulling the real LLM grader (and its clients) into this unit test.
vi.mock('../../src/services/open-ended-grading.service', () => ({
  gradeOpenEndedAnswers: vi.fn(),
  gradeOpenEndedBatch: vi.fn(),
}))

describe('scoreAnswers', () => {
  const emptyCorrectSets = new Map<string, Set<string>>()

  it('should score every answer correct (all correct)', () => {
    const questions: Question[] = [
      { id: 'q1', type: 'multiple_choice' },
      { id: 'q2', type: 'true_false' },
    ]
    const optionsById = new Map<string, Option>([
      ['o1', { id: 'o1', questionId: 'q1', isCorrect: true }],
      ['o2', { id: 'o2', questionId: 'q2', isCorrect: true }],
    ])

    const result = scoreAnswers(
      questions,
      [
        { questionId: 'q1', selectedOptionId: 'o1' },
        { questionId: 'q2', selectedOptionId: 'o2' },
      ],
      optionsById,
      emptyCorrectSets,
    )

    expect(result.totalQuestions).toBe(2)
    expect(result.correctAnswers).toBe(2)
    expect(result.wrongAnswers).toBe(0)
    expect(result.gradingStatus).toBe('complete')
    expect(result.correctnessByQuestion.get('q1')).toBe(true)
    expect(result.correctnessByQuestion.get('q2')).toBe(true)
  })

  it('should score every answer wrong (all wrong)', () => {
    const questions: Question[] = [
      { id: 'q1', type: 'multiple_choice' },
      { id: 'q2', type: 'true_false' },
    ]
    const optionsById = new Map<string, Option>([
      ['o1', { id: 'o1', questionId: 'q1', isCorrect: false }],
      ['o2', { id: 'o2', questionId: 'q2', isCorrect: false }],
    ])

    const result = scoreAnswers(
      questions,
      [
        { questionId: 'q1', selectedOptionId: 'o1' },
        { questionId: 'q2', selectedOptionId: 'o2' },
      ],
      optionsById,
      emptyCorrectSets,
    )

    expect(result.totalQuestions).toBe(2)
    expect(result.correctAnswers).toBe(0)
    expect(result.wrongAnswers).toBe(2)
    expect(result.correctnessByQuestion.get('q1')).toBe(false)
    expect(result.correctnessByQuestion.get('q2')).toBe(false)
  })

  it('should count open-ended toward the total but exclude it from the auto-score', () => {
    const questions: Question[] = [
      { id: 'q1', type: 'multiple_choice' },
      { id: 'open', type: 'open_ended' },
    ]
    const optionsById = new Map<string, Option>([
      ['o1', { id: 'o1', questionId: 'q1', isCorrect: true }],
    ])

    const result = scoreAnswers(
      questions,
      [
        { questionId: 'q1', selectedOptionId: 'o1' },
        { questionId: 'open', textAnswer: 'a thoughtful written answer' },
      ],
      optionsById,
      emptyCorrectSets,
    )

    // open-ended is in the denominator but not auto-credited; it awaits grading.
    expect(result.totalQuestions).toBe(2)
    expect(result.correctAnswers).toBe(1)
    expect(result.gradingStatus).toBe('pending')
    // Open-ended is never marked correct by the synchronous scorer.
    expect(result.correctnessByQuestion.has('open')).toBe(false)
  })

  it('should stay complete when an open-ended question is left unanswered', () => {
    const questions: Question[] = [
      { id: 'q1', type: 'multiple_choice' },
      { id: 'open', type: 'open_ended' },
    ]
    const optionsById = new Map<string, Option>([
      ['o1', { id: 'o1', questionId: 'q1', isCorrect: true }],
    ])

    const result = scoreAnswers(
      questions,
      [{ questionId: 'q1', selectedOptionId: 'o1' }],
      optionsById,
      emptyCorrectSets,
    )

    expect(result.totalQuestions).toBe(2)
    expect(result.correctAnswers).toBe(1)
    expect(result.gradingStatus).toBe('complete')
  })

  it('should require an exact set match for multi-select questions', () => {
    const questions: Question[] = [{ id: 'q1', type: 'multi_select' }]
    const optionsById = new Map<string, Option>([
      ['o1', { id: 'o1', questionId: 'q1', isCorrect: true }],
      ['o2', { id: 'o2', questionId: 'q1', isCorrect: true }],
      ['o3', { id: 'o3', questionId: 'q1', isCorrect: false }],
    ])
    const correctSets = new Map<string, Set<string>>([['q1', new Set(['o1', 'o2'])]])

    const exact = scoreAnswers(
      questions,
      [{ questionId: 'q1', selectedOptionIds: ['o1', 'o2'] }],
      optionsById,
      correctSets,
    )
    expect(exact.correctAnswers).toBe(1)
    expect(exact.correctnessByQuestion.get('q1')).toBe(true)

    const partial = scoreAnswers(
      questions,
      [{ questionId: 'q1', selectedOptionIds: ['o1'] }],
      optionsById,
      correctSets,
    )
    expect(partial.correctAnswers).toBe(0)
    expect(partial.correctnessByQuestion.get('q1')).toBe(false)
  })

  it('should throw when a selected option does not belong to its question', () => {
    const questions: Question[] = [{ id: 'q1', type: 'multiple_choice' }]
    const optionsById = new Map<string, Option>([
      ['o-other', { id: 'o-other', questionId: 'q2', isCorrect: true }],
    ])

    expect(() =>
      scoreAnswers(
        questions,
        [{ questionId: 'q1', selectedOptionId: 'o-other' }],
        optionsById,
        emptyCorrectSets,
      ),
    ).toThrow(AppError)
  })
})

describe('submitQuiz duplicate-answer handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectResults.length = 0
  })

  it('should keep only the first answer per question when duplicates are submitted', async () => {
    const quizQuestions = [
      { id: 'q1', type: 'multiple_choice' as QuestionType },
      { id: 'q2', type: 'multiple_choice' as QuestionType },
    ]
    // After dedup, only optA (q1) and optC (q2) are referenced.
    const optionRows = [
      { id: 'optA', questionId: 'q1', isCorrect: true },
      { id: 'optC', questionId: 'q2', isCorrect: true },
    ]

    // Queued in db read order: quiz lookup, questions, referenced options.
    selectResults.push([{ id: 'quiz-1' }], quizQuestions, optionRows)

    await submitQuiz('quiz-1', 'user-1', [
      { questionId: 'q1', selectedOptionId: 'optA' },
      // Duplicate for q1 — must be ignored. Counting it would double-score.
      { questionId: 'q1', selectedOptionId: 'optA' },
      { questionId: 'q2', selectedOptionId: 'optC' },
    ])

    // Find the quiz_results insert payload (the object carrying the score).
    const valuesFn = txMock.values as unknown as { mock: { calls: unknown[][] } }
    const valuesCalls = valuesFn.mock.calls.map((c) => c[0])
    const scorePayload = valuesCalls.find(
      (v): v is { totalQuestions: number; correctAnswers: number; wrongAnswers: number } =>
        v != null && typeof v === 'object' && 'totalQuestions' in v,
    )

    expect(scorePayload).toBeDefined()
    // 2 unique questions, both correct — the duplicate did not inflate the score.
    expect(scorePayload!.totalQuestions).toBe(2)
    expect(scorePayload!.correctAnswers).toBe(2)
    expect(scorePayload!.wrongAnswers).toBe(0)
  })
})
