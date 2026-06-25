import { expect } from 'chai'
import { describe, it, vi, beforeEach } from 'vitest'

import * as analyticsService from '../../src/services/analytics.service'

// A thenable query-builder mock: every chained call returns the builder, and
// awaiting it resolves the next value queued in `queue` (in db-call order).
// getAnalyticsSummary issues three reads: quiz results, token usage, then the
// per-question-type counts.
const { dbMock, queue } = vi.hoisted(() => {
  const queue: unknown[] = []
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  for (const m of ['select', 'from', 'where', 'innerJoin', 'leftJoin', 'groupBy', 'orderBy']) {
    builder[m] = vi.fn(chain)
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve(queue.length > 0 ? queue.shift() : [])
  return { dbMock: builder, queue }
})

vi.mock('../../src/database/database', () => ({ db: dbMock }))

const byType = (breakdown: Array<{ type: string; questionCount: number }>) =>
  Object.fromEntries(breakdown.map((t) => [t.type, t.questionCount]))

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queue.length = 0
  })

  describe('getAnalyticsSummary', () => {
    it('should return empty summary when no quiz results exist', async () => {
      // quizRows, tokenUsageRows, questionTypeRows
      queue.push([], [], [])

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
        },
      ]
      const mockTokenRows = [{ tokensUsed: { total_tokens: 100 } }]

      queue.push(mockQuizRows, mockTokenRows, [])

      const result = await analyticsService.getAnalyticsSummary('user-1')
      expect(result.totalQuizzesTaken).to.equal(1)
      expect(result.averageScore).to.equal(80)
      expect(result.totalTokensUsed).to.equal(100)
      expect(result.history[0].quizTitle).to.equal('Quiz 1')
    })

    it('should count questions per type so a mixed quiz spans multiple slices', async () => {
      const mockQuizRows = [
        {
          quizId: 'q-1',
          quizTitle: 'Mixed Quiz',
          createdAt: new Date('2024-01-01'),
          totalQuestions: 10,
          correctAnswers: 5,
        },
      ]
      // One mixed quiz: 6 multiple-choice + 4 true/false questions.
      const questionTypeRows = [
        { type: 'multiple_choice', count: 6 },
        { type: 'true_false', count: 4 },
      ]

      queue.push(mockQuizRows, [], questionTypeRows)

      const result = await analyticsService.getAnalyticsSummary('user-1')
      const counts = byType(result.typeBreakdown)

      // The mixed quiz contributes to both type slices, not a single bucket.
      expect(counts.multiple_choice).to.equal(6)
      expect(counts.true_false).to.equal(4)
      // All four types are always present, zero-filled.
      expect(result.typeBreakdown).to.have.lengthOf(4)
      expect(counts.multi_select).to.equal(0)
      expect(counts.open_ended).to.equal(0)
    })

    it('should count questions from owned quizzes even when none were taken', async () => {
      // No quiz results, but the user owns quizzes with questions.
      const questionTypeRows = [
        { type: 'multiple_choice', count: 3 },
        { type: 'open_ended', count: 2 },
      ]

      queue.push([], [], questionTypeRows)

      const result = await analyticsService.getAnalyticsSummary('user-1')
      const counts = byType(result.typeBreakdown)

      expect(result.totalQuizzesTaken).to.equal(0)
      expect(counts.multiple_choice).to.equal(3)
      expect(counts.open_ended).to.equal(2)
      expect(counts.true_false).to.equal(0)
      expect(counts.multi_select).to.equal(0)
    })

    it('should break question types down per folder as well as overall', async () => {
      // Two folders plus an unfoldered quiz, each contributing question types.
      const questionTypeRows = [
        { type: 'multiple_choice', folderId: 'folder-a', count: 5 },
        { type: 'true_false', folderId: 'folder-a', count: 2 },
        { type: 'open_ended', folderId: 'folder-b', count: 3 },
        { type: 'multiple_choice', folderId: null, count: 4 },
      ]

      queue.push([], [], questionTypeRows)

      const result = await analyticsService.getAnalyticsSummary('user-1')

      // Overall rollup sums across every folder.
      const all = byType(result.typeBreakdown)
      expect(all.multiple_choice).to.equal(9)
      expect(all.true_false).to.equal(2)
      expect(all.open_ended).to.equal(3)

      const byFolder = Object.fromEntries(
        result.typeBreakdownByFolder.map((f) => [f.folderId ?? 'null', byType(f.typeBreakdown)]),
      )

      // Folder A: only its own questions, zero-filled for the rest.
      expect(byFolder['folder-a'].multiple_choice).to.equal(5)
      expect(byFolder['folder-a'].true_false).to.equal(2)
      expect(byFolder['folder-a'].open_ended).to.equal(0)
      // Folder B and the unfoldered ('null') bucket stay scoped to their quizzes.
      expect(byFolder['folder-b'].open_ended).to.equal(3)
      expect(byFolder['folder-b'].multiple_choice).to.equal(0)
      expect(byFolder['null'].multiple_choice).to.equal(4)
    })
  })
})
