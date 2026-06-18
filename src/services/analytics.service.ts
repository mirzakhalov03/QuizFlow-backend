import { and, eq } from 'drizzle-orm'

import { DEFAULT_MODEL } from '../constants/models'
import { db } from '../database/database'
import { quizJobs, quizResults, quizzes } from '../database/schema'
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

export type QuizHistoryItem = {
  quizId: string
  quizTitle: string
  correctAnswers: number
  totalQuestions: number
  score: number
  date: string
}

export type KeyUsageSummary = {
  keyId: string | null
  keyName: string
  tokensUsed: number
  quizCount: number
  percentage: number
}

export type ModelUsageSummary = {
  modelName: string
  tokensUsed: number
  quizCount: number
  percentage: number
}

export type AnalyticsSummary = {
  totalQuizzesTaken: number
  averageScore: number
  scoreOverTime: ScorePoint[]
  breakdownByType: TypeBreakdown[]
  history: QuizHistoryItem[]
  totalTokensUsed: number
  keyUsageBreakdown: KeyUsageSummary[]
  modelUsageBreakdown: ModelUsageSummary[]
}

const toPercent = (correct: number, total: number) => (total > 0 ? (correct / total) * 100 : 0)

const round = (n: number) => Math.round(n * 100) / 100

export const getAnalyticsSummary = async (userId: string): Promise<AnalyticsSummary> => {
  const quizRows = await db
    .select({
      quizId: quizResults.quizId,
      quizTitle: quizzes.title,
      createdAt: quizResults.createdAt,
      totalQuestions: quizResults.totalQuestions,
      correctAnswers: quizResults.correctAnswers,
      quizType: quizzes.type,
    })
    .from(quizResults)
    .innerJoin(quizzes, eq(quizResults.quizId, quizzes.id))
    .where(eq(quizResults.userId, userId))

  const tokenUsageRows = await db
    .select({
      tokensUsed: quizJobs.tokensUsed,
      apiKeyId: quizJobs.apiKeyId,
      apiKeyName: quizJobs.apiKeyName,
      properties: quizzes.properties,
    })
    .from(quizJobs)
    .leftJoin(quizzes, eq(quizJobs.quizId, quizzes.id))
    .where(and(eq(quizJobs.userId, userId), eq(quizJobs.status, 'done')))

  let totalTokensUsed = 0
  const keyMap = new Map<
    string,
    { keyId: string | null; keyName: string; tokens: number; count: number }
  >()
  const modelMap = new Map<string, { modelName: string; tokens: number; count: number }>()

  // Initialize Default Key
  keyMap.set('system', { keyId: null, keyName: 'QuizFlow Default Key', tokens: 0, count: 0 })

  for (const row of tokenUsageRows) {
    let tokens = 0
    if (row.tokensUsed && typeof row.tokensUsed === 'object') {
      const usage = row.tokensUsed as { total_tokens?: number }
      tokens = usage.total_tokens ?? 0
    }
    totalTokensUsed += tokens

    const isByok = !!row.apiKeyId
    const keyKey = isByok ? row.apiKeyId! : 'system'
    const keyLabel = isByok ? (row.apiKeyName ?? 'BYOK Key') : 'QuizFlow Default Key'

    const entry = keyMap.get(keyKey) ?? {
      keyId: row.apiKeyId,
      keyName: keyLabel,
      tokens: 0,
      count: 0,
    }
    entry.tokens += tokens
    entry.count += 1
    keyMap.set(keyKey, entry)

    // Model extraction
    let modelName = DEFAULT_MODEL
    if (row.properties && typeof row.properties === 'object') {
      const props = row.properties as { model?: string }
      if (props.model) {
        modelName = props.model as typeof DEFAULT_MODEL
      }
    }
    const modelEntry = modelMap.get(modelName) ?? {
      modelName,
      tokens: 0,
      count: 0,
    }
    modelEntry.tokens += tokens
    modelEntry.count += 1
    modelMap.set(modelName, modelEntry)
  }

  const keyUsageBreakdown: KeyUsageSummary[] = Array.from(keyMap.values())
    .filter((k) => k.count > 0 || k.tokens > 0)
    .map((k) => ({
      keyId: k.keyId,
      keyName: k.keyName,
      tokensUsed: k.tokens,
      quizCount: k.count,
      percentage: totalTokensUsed > 0 ? round((k.tokens / totalTokensUsed) * 100) : 0,
    }))
    .sort((a, b) => b.tokensUsed - a.tokensUsed)

  const modelUsageBreakdown: ModelUsageSummary[] = Array.from(modelMap.values())
    .map((m) => ({
      modelName: m.modelName,
      tokensUsed: m.tokens,
      quizCount: m.count,
      percentage: totalTokensUsed > 0 ? round((m.tokens / totalTokensUsed) * 100) : 0,
    }))
    .sort((a, b) => b.tokensUsed - a.tokensUsed)

  if (quizRows.length === 0) {
    return {
      totalQuizzesTaken: 0,
      averageScore: 0,
      scoreOverTime: [],
      breakdownByType: [],
      history: [],
      totalTokensUsed,
      keyUsageBreakdown,
      modelUsageBreakdown,
    }
  }

  let gradedScoreSum = 0
  let gradedCount = 0
  const byDay = new Map<string, { sum: number; count: number }>()
  const byType = new Map<QuestionType, { sum: number; count: number }>()
  const history: QuizHistoryItem[] = []

  for (const r of quizRows) {
    if (r.totalQuestions <= 0) continue

    const percent = toPercent(r.correctAnswers, r.totalQuestions)
    gradedScoreSum += percent
    gradedCount += 1

    history.push({
      quizId: r.quizId,
      quizTitle: r.quizTitle,
      correctAnswers: r.correctAnswers,
      totalQuestions: r.totalQuestions,
      score: round(percent),
      date: r.createdAt.toISOString(),
    })

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

  history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return {
    totalQuizzesTaken: gradedCount,
    averageScore: round(averageScore),
    scoreOverTime,
    breakdownByType,
    history,
    totalTokensUsed,
    keyUsageBreakdown,
    modelUsageBreakdown,
  }
}
