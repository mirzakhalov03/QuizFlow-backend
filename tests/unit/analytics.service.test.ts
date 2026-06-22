import { expect } from 'chai'
import { describe, it, vi, beforeEach } from 'vitest'

import * as analyticsService from '../../src/services/analytics.service'

const { dbMock } = vi.hoisted(() => {
  const mock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve([])),
  }
  return { dbMock: mock }
})

vi.mock('../../src/database/database', () => ({
  db: dbMock,
}))

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.select.mockReturnThis()
    dbMock.from.mockReturnThis()
    dbMock.innerJoin.mockReturnThis()
    dbMock.leftJoin.mockReturnThis()
    dbMock.where.mockReturnThis()
  })

  describe('getAnalyticsSummary', () => {
    it('should return empty summary when no quiz results exist', async () => {
      dbMock.where.mockResolvedValueOnce([]).mockResolvedValueOnce([])

      const result = await analyticsService.getAnalyticsSummary('user-1')
      expect(result.totalQuizzesTaken).to.equal(0)
      expect(result.averageScore).to.equal(0)
      expect(result.history).to.be.an('array').that.has.lengthOf(0)
    })

    it('should calculate summary correctly when results exist', async () => {
      const mockQuizRows = [
        {
          quizId: 'q-1',
          quizTitle: 'Quiz 1',
          createdAt: new Date('2024-01-01'),
          totalQuestions: 10,
          correctAnswers: 8,
          quizType: 'multiple_choice',
        },
      ]
      const mockTokenRows = [{ tokensUsed: { total_tokens: 100 } }]

      dbMock.where.mockResolvedValueOnce(mockQuizRows).mockResolvedValueOnce(mockTokenRows)

      const result = await analyticsService.getAnalyticsSummary('user-1')
      expect(result.totalQuizzesTaken).to.equal(1)
      expect(result.averageScore).to.equal(80)
      expect(result.totalTokensUsed).to.equal(100)
      expect(result.history[0].quizTitle).to.equal('Quiz 1')
    })
  })
})
