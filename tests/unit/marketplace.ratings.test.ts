import { expect } from 'chai'
import { describe, it, vi, beforeEach } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import * as marketplaceService from '../../src/services/marketplace.service'

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
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mock)),
  }
  return { dbMock: mock }
})
vi.mock('../../src/database/database', () => ({ db: dbMock }))

describe('MarketplaceService ratings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const fn of Object.values(dbMock)) {
      if (typeof fn === 'function' && 'mockReturnThis' in fn) {
        ;(fn as ReturnType<typeof vi.fn>).mockReturnThis()
      }
    }
    dbMock.transaction = vi.fn((cb: (tx: unknown) => unknown) => cb(dbMock))
  })

  it('upsertRating throws NOT_TAKEN when the user has no result for the quiz', async () => {
    dbMock.limit
      .mockResolvedValueOnce([]) // ownership lookup → not the owner
      .mockResolvedValueOnce([]) // "has taken" lookup → none
    let thrown: unknown
    try {
      await marketplaceService.upsertRating('user-1', 'quiz-1', { score: 5 })
    } catch (e) {
      thrown = e
    }
    expect(thrown).to.be.instanceOf(AppError)
    expect((thrown as AppError).code).to.equal('NOT_TAKEN')
  })

  it('upsertRating throws OWN_QUIZ when the user owns the quiz', async () => {
    dbMock.limit.mockResolvedValueOnce([{ id: 'quiz-1' }]) // ownership lookup → is the owner
    let thrown: unknown
    try {
      await marketplaceService.upsertRating('user-1', 'quiz-1', { score: 5 })
    } catch (e) {
      thrown = e
    }
    expect(thrown).to.be.instanceOf(AppError)
    expect((thrown as AppError).code).to.equal('OWN_QUIZ')
  })
})
