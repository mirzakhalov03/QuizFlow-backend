import { eq } from 'drizzle-orm'

import { db } from '../database/database'
import { quizResults, quizzes } from '../database/schema'
import type { QuestionType } from '../types/questionTypes'

export type ScorePoint = {
  date: string
  score: number
}

export type TypeBreakdown = {
  type: QuestionType
  quizCount: number
  averageScore: number
}

export type AnalyticsSummary = {
  totalQuizzesTaken: number
  averageScore: number
  scoreOverTime: ScorePoint[]
  breakdownByType: TypeBreakdown[]
}

const toPercent = (correct: number, total: number) => (total > 0 ? (correct / total) * 100 : 0)

const round = (n: number) => Math.round(n * 100) / 100

export const getAnalyticsSummary = async (userId: string): Promise<AnalyticsSummary> => {
  const rows = await db
    .select({
      createdAt: quizResults.createdAt,
      totalQuestions: quizResults.totalQuestions,
      correctAnswers: quizResults.correctAnswers,
      quizType: quizzes.type,
    })
    .from(quizResults)
    .innerJoin(quizzes, eq(quizResults.quizId, quizzes.id))
    .where(eq(quizResults.userId, userId))

  if (rows.length === 0) {
    return {
      totalQuizzesTaken: 0,
      averageScore: 0,
      scoreOverTime: [],
      breakdownByType: [],
    }
  }

  let gradedScoreSum = 0
  let gradedCount = 0
  const byDay = new Map<string, { sum: number; count: number }>()
  const byType = new Map<QuestionType, { sum: number; count: number }>()

  for (const r of rows) {
    if (r.totalQuestions <= 0) continue

    const percent = toPercent(r.correctAnswers, r.totalQuestions)
    gradedScoreSum += percent
    gradedCount += 1

    const date = r.createdAt.toISOString().slice(0, 10)
    const dayEntry = byDay.get(date) ?? { sum: 0, count: 0 }
    dayEntry.sum += percent
    dayEntry.count += 1
    byDay.set(date, dayEntry)

    if (r.quizType) {
      const typeEntry = byType.get(r.quizType) ?? { sum: 0, count: 0 }
      typeEntry.sum += percent
      typeEntry.count += 1
      byType.set(r.quizType, typeEntry)
    }
  }

  const averageScore = gradedCount > 0 ? gradedScoreSum / gradedCount : 0

  const scoreOverTime: ScorePoint[] = Array.from(byDay.entries())
    .map(([date, { sum, count }]) => ({ date, score: round(sum / count) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const breakdownByType: TypeBreakdown[] = Array.from(byType.entries()).map(
    ([type, { sum, count }]) => ({
      type,
      quizCount: count,
      averageScore: round(sum / count),
    }),
  )

  return {
    totalQuizzesTaken: rows.length,
    averageScore: round(averageScore),
    scoreOverTime,
    breakdownByType,
  }
}
