import { and, asc, desc, eq, sql } from 'drizzle-orm'

import { db } from '../database/database'
import { folders, quizResults, quizzes } from '../database/schema'
import type { HistoryQuery } from '../validators/history.schema'

export type HistoryItem = {
  resultId: string
  quizId: string
  quizTitle: string
  folderId: string | null
  folderName: string | null
  score: number
  correctAnswers: number
  totalQuestions: number
  completedAt: string
}

export type HistoryResponse = {
  items: HistoryItem[]
}

const scoreExpr = sql<number>`(${quizResults.correctAnswers}::float / NULLIF(${quizResults.totalQuestions}, 0)) * 100`

export const getQuizHistory = async (
  userId: string,
  { folderId, limit, sort }: HistoryQuery,
): Promise<HistoryResponse> => {
  const orderBy =
    sort === 'best'
      ? [desc(scoreExpr), desc(quizResults.createdAt)]
      : sort === 'worst'
        ? [asc(scoreExpr), desc(quizResults.createdAt)]
        : [desc(quizResults.createdAt)]

  const rows = await db
    .select({
      resultId: quizResults.id,
      quizId: quizResults.quizId,
      quizTitle: quizzes.title,
      folderId: quizzes.folderId,
      folderName: folders.name,
      correctAnswers: quizResults.correctAnswers,
      totalQuestions: quizResults.totalQuestions,
      completedAt: quizResults.createdAt,
    })
    .from(quizResults)
    .innerJoin(quizzes, eq(quizResults.quizId, quizzes.id))
    .leftJoin(folders, eq(quizzes.folderId, folders.id))
    .where(
      and(eq(quizResults.userId, userId), folderId ? eq(quizzes.folderId, folderId) : undefined),
    )
    .orderBy(...orderBy)
    .limit(limit)

  const items: HistoryItem[] = rows
    .filter((r) => r.totalQuestions > 0)
    .map((r) => ({
      resultId: r.resultId,
      quizId: r.quizId,
      quizTitle: r.quizTitle,
      folderId: r.folderId,
      folderName: r.folderName,
      score: Math.round((r.correctAnswers / r.totalQuestions) * 100 * 100) / 100,
      correctAnswers: r.correctAnswers,
      totalQuestions: r.totalQuestions,
      completedAt: r.completedAt.toISOString(),
    }))

  return { items }
}
