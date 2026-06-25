import { and, eq, sql } from 'drizzle-orm'

import { DEFAULT_MODEL } from '../constants/models'
import { db } from '../database/database'
import { folders, questions, quizJobs, quizResults, quizzes } from '../database/schema'
import { QUESTION_TYPES } from '../types/questionTypes'
import type { QuestionType } from '../types/questionTypes'

export type ScorePoint = {
  date: string
  score: number
  quizId: string
  quizTitle: string
}

export type TypeBreakdown = {
  type: QuestionType
  questionCount: number
}

/**
 * Per-folder question-type breakdown. `folderId` is the folder id, or null for
 * quizzes with no folder ('Unassigned'). The all-quizzes rollup is the
 * top-level `typeBreakdown` field, so it is intentionally absent here.
 */
export type FolderTypeBreakdown = {
  folderId: string | null
  typeBreakdown: TypeBreakdown[]
}

export type QuizHistoryItem = {
  quizId: string
  quizTitle: string
  correctAnswers: number
  totalQuestions: number
  score: number
  date: string
}

/** Folder rollup. The synthetic 'all' entry sits first and covers every quiz. */
export type FolderStat = {
  folderId: string | null
  folderName: string
  averageScore: number
  bestScore: number
  attemptCount: number
}

export type QuizStat = {
  quizId: string
  quizTitle: string
  folderId: string | null
  averageScore: number
  bestScore: number
  attemptCount: number
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
  typeBreakdown: TypeBreakdown[]
  typeBreakdownByFolder: FolderTypeBreakdown[]
  folderStats: FolderStat[]
  quizStats: QuizStat[]
  history: QuizHistoryItem[]
  totalTokensUsed: number
  keyUsageBreakdown: KeyUsageSummary[]
  modelUsageBreakdown: ModelUsageSummary[]
}

const toPercent = (correct: number, total: number) => (total > 0 ? (correct / total) * 100 : 0)

const round = (n: number) => Math.round(n * 100) / 100

export const getAnalyticsSummary = async (userId: string): Promise<AnalyticsSummary> => {
  // These three reads are independent, so run them concurrently rather than
  // serializing the round-trips. `questionTypeRows` counts every question across
  // all quizzes the user owns (taken or not), so a mixed-type quiz contributes
  // to each type it contains rather than a single quiz-level bucket.
  const [quizRows, tokenUsageRows, questionTypeRows] = await Promise.all([
    db
      .select({
        quizId: quizResults.quizId,
        quizTitle: quizzes.title,
        createdAt: quizResults.createdAt,
        totalQuestions: quizResults.totalQuestions,
        correctAnswers: quizResults.correctAnswers,
        folderId: quizzes.folderId,
        folderName: folders.name,
      })
      .from(quizResults)
      .innerJoin(quizzes, eq(quizResults.quizId, quizzes.id))
      .leftJoin(folders, eq(quizzes.folderId, folders.id))
      .where(eq(quizResults.userId, userId)),

    db
      .select({
        tokensUsed: quizJobs.tokensUsed,
        apiKeyId: quizJobs.apiKeyId,
        apiKeyName: quizJobs.apiKeyName,
        properties: quizzes.properties,
      })
      .from(quizJobs)
      .leftJoin(quizzes, eq(quizJobs.quizId, quizzes.id))
      .where(and(eq(quizJobs.userId, userId), eq(quizJobs.status, 'done'))),

    db
      .select({
        type: questions.type,
        folderId: quizzes.folderId,
        count: sql<number>`count(*)::int`,
      })
      .from(questions)
      .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
      .where(eq(quizzes.userId, userId))
      .groupBy(questions.type, quizzes.folderId),
  ])

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

  // Roll the per-folder counts up into an all-quizzes total and keep a
  // per-folder tally so the chart can scope to the selected folder. Folder key
  // is the folder id, or '' for quizzes with no folder ('Unassigned').
  const questionTypeCounts = new Map<QuestionType, number>()
  const folderTypeCounts = new Map<string, Map<QuestionType, number>>()
  for (const row of questionTypeRows) {
    questionTypeCounts.set(row.type, (questionTypeCounts.get(row.type) ?? 0) + row.count)

    const folderKey = row.folderId ?? ''
    const folderCounts = folderTypeCounts.get(folderKey) ?? new Map<QuestionType, number>()
    folderCounts.set(row.type, (folderCounts.get(row.type) ?? 0) + row.count)
    folderTypeCounts.set(folderKey, folderCounts)
  }

  // Always send the real question-type slices so the pie chart can zero-fill
  // empties. 'mixed' is a quiz-level type, never a question type, so it is
  // excluded from the per-question breakdown.
  const buildTypeBreakdown = (counts: Map<QuestionType, number>): TypeBreakdown[] =>
    QUESTION_TYPES.filter((type) => type !== 'mixed').map((type) => ({
      type,
      questionCount: counts.get(type) ?? 0,
    }))

  const typeBreakdown: TypeBreakdown[] = buildTypeBreakdown(questionTypeCounts)
  const typeBreakdownByFolder: FolderTypeBreakdown[] = Array.from(folderTypeCounts.entries()).map(
    ([folderKey, counts]) => ({
      folderId: folderKey === '' ? null : folderKey,
      typeBreakdown: buildTypeBreakdown(counts),
    }),
  )

  if (quizRows.length === 0) {
    return {
      totalQuizzesTaken: 0,
      averageScore: 0,
      scoreOverTime: [],
      typeBreakdown,
      typeBreakdownByFolder,
      folderStats: [
        {
          folderId: null,
          folderName: 'All quizzes',
          averageScore: 0,
          bestScore: 0,
          attemptCount: 0,
        },
      ],
      quizStats: [],
      history: [],
      totalTokensUsed,
      keyUsageBreakdown,
      modelUsageBreakdown,
    }
  }

  let gradedScoreSum = 0
  let gradedCount = 0
  const history: QuizHistoryItem[] = []
  const scoreOverTime: ScorePoint[] = []

  type FolderAcc = { folderName: string; sum: number; best: number; count: number }
  type QuizAcc = {
    quizTitle: string
    folderId: string | null
    sum: number
    best: number
    count: number
  }
  // Synthetic "all" bucket stays first in the folderStats output.
  const allFolder: FolderAcc = { folderName: 'All quizzes', sum: 0, best: 0, count: 0 }
  // folderId may be null (root). Key the map by '' for null so it slots in cleanly.
  const folderAccs = new Map<string, FolderAcc>()
  const quizAccs = new Map<string, QuizAcc>()

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

    scoreOverTime.push({
      date: r.createdAt.toISOString(),
      score: round(percent),
      quizId: r.quizId,
      quizTitle: r.quizTitle,
    })

    allFolder.sum += percent
    allFolder.count += 1
    if (percent > allFolder.best) allFolder.best = percent

    const folderKey = r.folderId ?? ''
    const folderName = r.folderId ? (r.folderName ?? 'Unnamed folder') : 'Unassigned'
    const folderAcc = folderAccs.get(folderKey) ?? { folderName, sum: 0, best: 0, count: 0 }
    folderAcc.sum += percent
    folderAcc.count += 1
    if (percent > folderAcc.best) folderAcc.best = percent
    folderAccs.set(folderKey, folderAcc)

    const quizAcc = quizAccs.get(r.quizId) ?? {
      quizTitle: r.quizTitle,
      folderId: r.folderId ?? null,
      sum: 0,
      best: 0,
      count: 0,
    }
    quizAcc.sum += percent
    quizAcc.count += 1
    if (percent > quizAcc.best) quizAcc.best = percent
    quizAccs.set(r.quizId, quizAcc)
  }

  const averageScore = gradedCount > 0 ? gradedScoreSum / gradedCount : 0

  scoreOverTime.sort((a, b) => a.date.localeCompare(b.date))

  const folderStats: FolderStat[] = [
    {
      folderId: null,
      folderName: 'All quizzes',
      averageScore: allFolder.count > 0 ? round(allFolder.sum / allFolder.count) : 0,
      bestScore: round(allFolder.best),
      attemptCount: allFolder.count,
    },
    ...Array.from(folderAccs.entries())
      .map(([key, acc]) => ({
        folderId: key === '' ? null : key,
        folderName: acc.folderName,
        averageScore: acc.count > 0 ? round(acc.sum / acc.count) : 0,
        bestScore: round(acc.best),
        attemptCount: acc.count,
      }))
      .sort((a, b) => b.attemptCount - a.attemptCount),
  ]

  const quizStats: QuizStat[] = Array.from(quizAccs.entries())
    .map(([quizId, acc]) => ({
      quizId,
      quizTitle: acc.quizTitle,
      folderId: acc.folderId,
      averageScore: acc.count > 0 ? round(acc.sum / acc.count) : 0,
      bestScore: round(acc.best),
      attemptCount: acc.count,
    }))
    .sort((a, b) => b.attemptCount - a.attemptCount)

  history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return {
    totalQuizzesTaken: gradedCount,
    averageScore: round(averageScore),
    scoreOverTime,
    typeBreakdown,
    typeBreakdownByFolder,
    folderStats,
    quizStats,
    history,
    totalTokensUsed,
    keyUsageBreakdown,
    modelUsageBreakdown,
  }
}
