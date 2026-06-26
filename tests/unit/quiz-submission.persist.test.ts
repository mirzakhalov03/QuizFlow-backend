import { expect } from 'chai'
import { describe, it, vi, beforeEach } from 'vitest'

// Mock the marketplace play-count helper so we can assert it's called.
// Defined via vi.hoisted so the hoisted vi.mock factory can reference it.
const { incrementPlayCount } = vi.hoisted(() => ({
  incrementPlayCount: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../src/services/marketplace.service', () => ({ incrementPlayCount }))

// Minimal db mock: this test only asserts play-count is bumped for a found quiz.
const { dbMock } = vi.hoisted(() => {
  const mock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
  return { dbMock: mock }
})
vi.mock('../../src/database/database', () => ({ db: dbMock }))

import { submitPublicQuiz } from '../../src/services/quiz-submission.service'

describe('submitPublicQuiz play-count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(dbMock)) {
      if (typeof fn === 'function' && 'mockReturnThis' in fn) {
        ;(fn as ReturnType<typeof vi.fn>).mockReturnThis()
      }
    }
    dbMock.transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(dbMock))
  })

  it('returns null and does not bump play count when the token is not public', async () => {
    dbMock.limit.mockResolvedValueOnce([]) // quiz lookup: not found
    const result = await submitPublicQuiz('bad-token', 'Anon', [])
    expect(result).to.equal(null)
    expect(incrementPlayCount.mock.calls.length).to.equal(0)
  })
})
