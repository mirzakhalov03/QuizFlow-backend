import request from 'supertest'
import { describe, it, vi, beforeEach, expect } from 'vitest'

import app from '../../src/app'
import { AppError } from '../../src/helpers/AppError'
import * as bookmarkService from '../../src/services/bookmark.service'

vi.mock('../../src/services/bookmark.service')

vi.mock('../../src/middlewares/authMiddleware', () => ({
  authMiddleware: vi.fn((req, _res, next) => {
    ;(req as Record<string, unknown>).user = { id: 'user-1' }
    next()
  }),
  optionalAuthMiddleware: vi.fn((req, _res, next) => {
    ;(req as Record<string, unknown>).user = { id: 'user-1' }
    next()
  }),
}))

const QUESTION_ID = '11111111-1111-4111-8111-111111111111'

describe('Bookmark Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── POST /questions/:questionId/bookmark ─────────────────────────────────
  describe('POST /questions/:questionId/bookmark', () => {
    it('returns 201 when the question is bookmarked successfully', async () => {
      vi.mocked(bookmarkService.addBookmark).mockResolvedValue(undefined)

      const res = await request(app).post(`/questions/${QUESTION_ID}/bookmark`)

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.questionId).toBe(QUESTION_ID)
      expect(bookmarkService.addBookmark).toHaveBeenCalledWith('user-1', QUESTION_ID)
    })

    it('returns 403 when the question is not in the user library', async () => {
      vi.mocked(bookmarkService.addBookmark).mockRejectedValue(
        new AppError('Not in library', 403, 'FORBIDDEN'),
      )

      const res = await request(app).post(`/questions/${QUESTION_ID}/bookmark`)

      expect(res.status).toBe(403)
    })

    it('returns 409 when the question is already bookmarked', async () => {
      vi.mocked(bookmarkService.addBookmark).mockRejectedValue(
        new AppError('Already bookmarked', 409, 'CONFLICT'),
      )

      const res = await request(app).post(`/questions/${QUESTION_ID}/bookmark`)

      expect(res.status).toBe(409)
    })
  })

  // ── DELETE /questions/:questionId/bookmark ───────────────────────────────
  describe('DELETE /questions/:questionId/bookmark', () => {
    it('returns 200 when the bookmark is removed', async () => {
      vi.mocked(bookmarkService.removeBookmark).mockResolvedValue(undefined)

      const res = await request(app).delete(`/questions/${QUESTION_ID}/bookmark`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(bookmarkService.removeBookmark).toHaveBeenCalledWith('user-1', QUESTION_ID)
    })

    it('returns 404 when the bookmark does not exist', async () => {
      vi.mocked(bookmarkService.removeBookmark).mockRejectedValue(
        new AppError('Bookmark not found', 404, 'NOT_FOUND'),
      )

      const res = await request(app).delete(`/questions/${QUESTION_ID}/bookmark`)

      expect(res.status).toBe(404)
    })
  })

  // ── GET /bookmarks ───────────────────────────────────────────────────────
  describe('GET /bookmarks', () => {
    it('returns 200 with an empty list when no bookmarks exist', async () => {
      vi.mocked(bookmarkService.getBookmarks).mockResolvedValue([])

      const res = await request(app).get('/bookmarks')

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toHaveLength(0)
      expect(res.body.data.count).toBe(0)
    })

    it('returns 200 with embedded MCQ answer', async () => {
      const mockBookmarks = [
        {
          bookmarkId: 'bm-1',
          bookmarkedAt: new Date('2026-01-01').toISOString(),
          quiz: { id: 'quiz-1', title: 'Chemistry 101' },
          question: {
            id: QUESTION_ID,
            text: 'What is H2O?',
            type: 'multiple_choice' as const,
            correctOptions: [{ id: 'opt-1', text: 'Water', explanation: 'H2O is water.' }],
            modelAnswer: null,
          },
        },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(bookmarkService.getBookmarks).mockResolvedValue(mockBookmarks as any)

      const res = await request(app).get('/bookmarks')

      expect(res.status).toBe(200)
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.items[0].question.type).toBe('multiple_choice')
      expect(res.body.data.items[0].question.correctOptions).toHaveLength(1)
      expect(res.body.data.items[0].question.modelAnswer).toBeNull()
    })

    it('returns 200 with embedded modelAnswer for open-ended question', async () => {
      const mockBookmarks = [
        {
          bookmarkId: 'bm-2',
          bookmarkedAt: new Date('2026-01-02').toISOString(),
          quiz: { id: 'quiz-2', title: 'Biology' },
          question: {
            id: QUESTION_ID,
            text: 'Explain photosynthesis.',
            type: 'open_ended' as const,
            correctOptions: [],
            modelAnswer: 'Plants convert light into chemical energy...',
          },
        },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(bookmarkService.getBookmarks).mockResolvedValue(mockBookmarks as any)

      const res = await request(app).get('/bookmarks')

      expect(res.status).toBe(200)
      expect(res.body.data.items[0].question.correctOptions).toHaveLength(0)
      expect(res.body.data.items[0].question.modelAnswer).toBe(
        'Plants convert light into chemical energy...',
      )
    })

    it('passes limit and offset query params to the service', async () => {
      vi.mocked(bookmarkService.getBookmarks).mockResolvedValue([])

      await request(app).get('/bookmarks?limit=10&offset=20')

      expect(bookmarkService.getBookmarks).toHaveBeenCalledWith('user-1', 10, 20)
    })

    it('returns 400 when limit is out of range', async () => {
      const res = await request(app).get('/bookmarks?limit=999')

      expect(res.status).toBe(400)
      expect(bookmarkService.getBookmarks).not.toHaveBeenCalled()
    })
  })
})
