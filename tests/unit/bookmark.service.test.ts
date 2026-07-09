import { describe, it, vi, beforeEach, expect } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import * as bookmarkService from '../../src/services/bookmark.service'

// ── DB mock ──────────────────────────────────────────────────────────────────
const { dbMock } = vi.hoisted(() => {
  const mock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: unknown[]) => unknown) => resolve([])),
  }
  return { dbMock: mock }
})

vi.mock('../../src/database/database', () => ({ db: dbMock }))

// ── Helpers ──────────────────────────────────────────────────────────────────
const resetDb = () => {
  vi.clearAllMocks()
  dbMock.select.mockReturnThis()
  dbMock.from.mockReturnThis()
  dbMock.where.mockReturnThis()
  dbMock.innerJoin.mockReturnThis()
  dbMock.orderBy.mockReturnThis()
  dbMock.limit.mockReturnThis()
  dbMock.offset.mockReturnThis()
  dbMock.insert.mockReturnThis()
  dbMock.values.mockReturnThis()
  dbMock.delete.mockReturnThis()
  dbMock.returning.mockReturnThis()
  dbMock.then.mockImplementation((resolve: (v: unknown[]) => unknown) => resolve([]))
}

// Simulate a row being returned from the DB on a specific sequential call.
const resolveOnce = (rows: unknown[]) =>
  dbMock.then.mockImplementationOnce((resolve: (v: unknown[]) => unknown) => resolve(rows))

// ── addBookmark ──────────────────────────────────────────────────────────────
describe('addBookmark', () => {
  beforeEach(resetDb)

  it('bookmarks a question the user owns', async () => {
    resolveOnce([{ id: 'q-1' }]) // ownership check
    // insert resolves void (empty array is fine)

    await expect(bookmarkService.addBookmark('user-1', 'q-1')).resolves.toBeUndefined()
  })

  it('throws 403 when the question is not in the user library', async () => {
    resolveOnce([]) // ownership check returns nothing

    await expect(bookmarkService.addBookmark('user-1', 'q-x')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    })
  })

  it('throws 409 when the question is already bookmarked', async () => {
    resolveOnce([{ id: 'q-1' }]) // ownership check passes
    // Simulate unique-constraint violation from pg driver
    dbMock.values.mockRejectedValueOnce({ code: '23505' })

    await expect(bookmarkService.addBookmark('user-1', 'q-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    })
  })
})

// ── removeBookmark ───────────────────────────────────────────────────────────
describe('removeBookmark', () => {
  beforeEach(resetDb)

  it('removes an existing bookmark', async () => {
    dbMock.returning.mockResolvedValueOnce([{ id: 'bm-1' }])

    await expect(bookmarkService.removeBookmark('user-1', 'q-1')).resolves.toBeUndefined()
  })

  it('throws 404 when the bookmark does not exist', async () => {
    dbMock.returning.mockResolvedValueOnce([])

    await expect(bookmarkService.removeBookmark('user-1', 'q-x')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

// ── getBookmarks ─────────────────────────────────────────────────────────────
describe('getBookmarks', () => {
  beforeEach(resetDb)

  it('returns an empty array when there are no bookmarks', async () => {
    resolveOnce([])
    const result = await bookmarkService.getBookmarks('user-1')
    expect(result).toEqual([])
  })

  it('embeds correctOptions for a multiple-choice question', async () => {
    resolveOnce([
      {
        bookmarkId: 'bm-1',
        bookmarkedAt: new Date('2026-01-01'),
        questionId: 'q-mc',
        questionText: 'Which element is H2O?',
        questionType: 'multiple_choice',
        quizId: 'quiz-1',
        quizTitle: 'Chemistry 101',
      },
    ])
    resolveOnce([
      {
        questionId: 'q-mc',
        id: 'opt-1',
        text: 'Hydrogen',
        explanation: 'H2O is water made of hydrogen and oxygen.',
      },
    ])

    const result = await bookmarkService.getBookmarks('user-1')

    expect(result).toHaveLength(1)
    expect(result[0].question.correctOptions).toHaveLength(1)
    expect(result[0].question.correctOptions[0].text).toBe('Hydrogen')
    expect(result[0].question.modelAnswer).toBeNull()
  })

  it('embeds modelAnswer and empty correctOptions for an open-ended question', async () => {
    resolveOnce([
      {
        bookmarkId: 'bm-2',
        bookmarkedAt: new Date('2026-01-02'),
        questionId: 'q-oe',
        questionText: 'Explain photosynthesis.',
        questionType: 'open_ended',
        quizId: 'quiz-2',
        quizTitle: 'Biology',
      },
    ])
    resolveOnce([
      {
        questionId: 'q-oe',
        id: 'opt-2',
        text: 'Plants convert light into energy...',
        explanation: null,
      },
    ])

    const result = await bookmarkService.getBookmarks('user-1')

    expect(result).toHaveLength(1)
    expect(result[0].question.correctOptions).toEqual([])
    expect(result[0].question.modelAnswer).toBe('Plants convert light into energy...')
  })

  it('sets modelAnswer to null when no correct option exists for open-ended', async () => {
    resolveOnce([
      {
        bookmarkId: 'bm-3',
        bookmarkedAt: new Date('2026-01-03'),
        questionId: 'q-oe2',
        questionText: 'Describe entropy.',
        questionType: 'open_ended',
        quizId: 'quiz-3',
        quizTitle: 'Physics',
      },
    ])
    resolveOnce([]) // no correct option rows

    const result = await bookmarkService.getBookmarks('user-1')

    expect(result[0].question.modelAnswer).toBeNull()
    expect(result[0].question.correctOptions).toEqual([])
  })
})

// ── AppError is exported correctly ──────────────────────────────────────────
describe('AppError usage', () => {
  it('AppError has expected shape', () => {
    const err = new AppError('test', 404, 'NOT_FOUND')
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
  })
})
