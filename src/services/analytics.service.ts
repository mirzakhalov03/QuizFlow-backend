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

  const gradedRows = rows.filter((r) => r.totalQuestions > 0)

  const averageScore = gradedRows.length
    ? gradedRows.reduce((sum, r) => sum + toPercent(r.correctAnswers, r.totalQuestions), 0) /
      gradedRows.length
    : 0

  const byDay = new Map<string, { sum: number; count: number }>()
  for (const r of gradedRows) {
    const y = r.createdAt.getFullYear()
    const m = String(r.createdAt.getMonth() + 1).padStart(2, '0')
    const d = String(r.createdAt.getDate()).padStart(2, '0')
    const date = `${y}-${m}-${d}`
    const entry = byDay.get(date) ?? { sum: 0, count: 0 }
    entry.sum += toPercent(r.correctAnswers, r.totalQuestions)
    entry.count += 1
    byDay.set(date, entry)
  }
  const scoreOverTime: ScorePoint[] = Array.from(byDay.entries())
    .map(([date, { sum, count }]) => ({ date, score: round(sum / count) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const byType = new Map<QuestionType, { sum: number; count: number }>()
  for (const r of gradedRows) {
    if (!r.quizType) continue
    const entry = byType.get(r.quizType) ?? { sum: 0, count: 0 }
    entry.sum += toPercent(r.correctAnswers, r.totalQuestions)
    entry.count += 1
    byType.set(r.quizType, entry)
  }
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
