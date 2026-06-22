import request from 'supertest'
import { describe, it, vi, beforeEach, expect } from 'vitest'

import app from '../../src/app'
import * as quizSubmissionService from '../../src/services/quiz-submission.service'
import * as quizService from '../../src/services/quiz.service'

vi.mock('../../src/services/quiz.service')
vi.mock('../../src/services/quiz-submission.service')

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

describe('Quiz Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /quizzes', () => {
    it('should return 200 and a list of quizzes', async () => {
      const mockItems = [{ id: 'quiz-1', title: 'Test Quiz' }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(quizService.getQuizzes).mockResolvedValue({ items: mockItems as any, total: 1 })

      const response = await request(app).get('/quizzes')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.items).toHaveLength(1)
      expect(response.body.data.items[0].title).toBe('Test Quiz')
    })
  })

  describe('GET /quizzes/:id', () => {
    it('should return 200 and the quiz when it exists', async () => {
      const mockQuiz = { id: 'quiz-1', title: 'Test Quiz', questions: [] }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(quizService.getQuizById).mockResolvedValue(mockQuiz as any)

      const response = await request(app).get('/quizzes/quiz-1')

      expect(response.status).toBe(200)
      expect(response.body.data.id).toBe('quiz-1')
    })

    it('should return 404 when the quiz does not exist', async () => {
      vi.mocked(quizService.getQuizById).mockResolvedValue(null)

      const response = await request(app).get('/quizzes/non-existent')

      expect(response.status).toBe(404)
    })
  })

  describe('PATCH /quizzes/:id', () => {
    it('should return 200 and the updated quiz', async () => {
      const updated = { id: 'quiz-1', title: 'Renamed Quiz' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(quizService.updateQuizById).mockResolvedValue(updated as any)

      const response = await request(app).patch('/quizzes/quiz-1').send({ title: 'Renamed Quiz' })

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Quiz updated successfully')
      expect(response.body.data.title).toBe('Renamed Quiz')
    })

    it('should return 404 when the quiz does not exist', async () => {
      vi.mocked(quizService.updateQuizById).mockResolvedValue(null)

      const response = await request(app).patch('/quizzes/missing').send({ title: 'Whatever' })

      expect(response.status).toBe(404)
    })

    it('should return 400 when no updatable field is provided', async () => {
      const response = await request(app).patch('/quizzes/quiz-1').send({})

      expect(response.status).toBe(400)
      expect(quizService.updateQuizById).not.toHaveBeenCalled()
    })
  })

  describe('DELETE /quizzes/:id', () => {
    it('should return 200 when quiz is deleted', async () => {
      vi.mocked(quizService.deleteQuizById).mockResolvedValue(true)

      const response = await request(app).delete('/quizzes/quiz-1')

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Quiz deleted successfully')
    })
  })

  describe('POST /quizzes/:id/submit', () => {
    const questionId = '11111111-1111-4111-8111-111111111111'
    const optionId = '22222222-2222-4222-8222-222222222222'

    it('should return 200 and the scored result for a valid submission', async () => {
      const scored = {
        id: 'result-1',
        totalQuestions: 2,
        correctAnswers: 2,
        wrongAnswers: 0,
        gradingStatus: 'complete',
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(quizSubmissionService.submitQuiz).mockResolvedValue(scored as any)

      const response = await request(app)
        .post('/quizzes/quiz-1/submit')
        .send({ answers: [{ questionId, selectedOptionId: optionId }] })

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Quiz submitted successfully')
      expect(response.body.data.correctAnswers).toBe(2)
      expect(response.body.data.totalQuestions).toBe(2)
      expect(quizSubmissionService.submitQuiz).toHaveBeenCalledWith('quiz-1', 'user-1', [
        { questionId, selectedOptionId: optionId },
      ])
    })

    it('should return 404 when the quiz is not found', async () => {
      vi.mocked(quizSubmissionService.submitQuiz).mockResolvedValue(null)

      const response = await request(app)
        .post('/quizzes/quiz-1/submit')
        .send({ answers: [{ questionId, selectedOptionId: optionId }] })

      expect(response.status).toBe(404)
    })

    it('should return 400 and not score when answers contain a duplicate questionId', async () => {
      const response = await request(app)
        .post('/quizzes/quiz-1/submit')
        .send({
          answers: [
            { questionId, selectedOptionId: optionId },
            { questionId, selectedOptionId: optionId },
          ],
        })

      expect(response.status).toBe(400)
      expect(quizSubmissionService.submitQuiz).not.toHaveBeenCalled()
    })

    it('should return 400 when an answer carries no selection', async () => {
      const response = await request(app)
        .post('/quizzes/quiz-1/submit')
        .send({ answers: [{ questionId }] })

      expect(response.status).toBe(400)
      expect(quizSubmissionService.submitQuiz).not.toHaveBeenCalled()
    })
  })
})
