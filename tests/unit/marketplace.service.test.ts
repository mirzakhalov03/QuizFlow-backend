import { expect } from 'chai'
import { describe, it, vi, beforeEach } from 'vitest'

import * as marketplaceService from '../../src/services/marketplace.service'

const { dbMock } = vi.hoisted(() => {
  const mock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    transaction: vi.fn((cb) => cb(mock)),
  }
  return { dbMock: mock }
})

vi.mock('../../src/database/database', () => ({ db: dbMock }))

const resetChain = () => {
  for (const fn of Object.values(dbMock)) {
    if (typeof fn === 'function' && 'mockReturnThis' in fn) {
      ;(fn as ReturnType<typeof vi.fn>).mockReturnThis()
    }
  }
  dbMock.transaction = vi.fn((cb: (tx: typeof dbMock) => unknown) => cb(dbMock))
}

describe('MarketplaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetChain()
  })

  describe('publishListing', () => {
    it('returns null when the quiz is not owned by the user', async () => {
      // ownership lookup resolves to no rows
      dbMock.limit.mockResolvedValueOnce([])
      const result = await marketplaceService.publishListing('user-1', 'quiz-1', {
        description: 'A great quiz',
        category: 'science',
      })
      expect(result).to.equal(null)
    })
  })

  describe('unpublishListing', () => {
    it('returns false when no listing row was deleted', async () => {
      // ownership lookup returns the quiz, delete returns no rows
      dbMock.limit.mockResolvedValueOnce([{ id: 'quiz-1' }])
      dbMock.returning.mockResolvedValueOnce([])
      const result = await marketplaceService.unpublishListing('user-1', 'quiz-1')
      expect(result).to.equal(false)
    })
  })

  describe('getListingDetail', () => {
    it('returns null when no listing exists for the quiz', async () => {
      dbMock.limit.mockResolvedValueOnce([])
      const result = await marketplaceService.getListingDetail('quiz-1')
      expect(result).to.equal(null)
    })
  })
})
