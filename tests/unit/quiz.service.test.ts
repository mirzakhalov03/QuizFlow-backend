import { describe, it, vi, beforeEach, expect } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import * as quizService from '../../src/services/quiz.service'

const { dbMock } = vi.hoisted(() => {
  const mock = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve([])),
  }
  return { dbMock: mock }
})

vi.mock('../../src/database/database', () => ({
  db: dbMock,
}))

describe('QuizService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbMock.then.mockImplementation((resolve) => resolve([]))
  })

  describe('getQuizzes', () => {
    it('should return empty list and total 0 when no quizzes found', async () => {
      const result = await quizService.getQuizzes({ userId: 'user-1' })
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should return items and total when quizzes found', async () => {
      const mockRows = [{ id: 'quiz-1', title: 'Test Quiz', total: 1 }]
      dbMock.then.mockImplementationOnce((resolve) => resolve(mockRows))

      const result = await quizService.getQuizzes({ userId: 'user-1' })
      expect(result.items[0].id).toBe('quiz-1')
      expect(result.total).toBe(1)
    })
  })

  describe('updateQuizById', () => {
    it('should throw AppError if folder not found', async () => {
      dbMock.then.mockImplementationOnce((resolve) => resolve([]))

      await expect(
        quizService.updateQuizById('quiz-1', { folderId: 'folder-1' }, 'user-1'),
      ).rejects.toThrow(AppError)
    })

    it('should update quiz when folder exists', async () => {
      dbMock.then
        .mockImplementationOnce((resolve) => resolve([{ id: 'folder-1' }]))
        .mockImplementationOnce((resolve) => resolve([{ id: 'quiz-1', title: 'Updated' }]))

      const result = await quizService.updateQuizById(
        'quiz-1',
        { title: 'Updated', folderId: 'folder-1' },
        'user-1',
      )
      expect(result?.title).toBe('Updated')
    })
  })
})
