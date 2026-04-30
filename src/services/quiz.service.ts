import { and, desc, eq, sql } from 'drizzle-orm'

import { db } from '../database/database'
import { quizzes } from '../database/schema'
import type { QuestionType } from '../types/questionTypes'

type GetQuizzesParams = {
  userId?: string
  limit?: number
  offset?: number
}

type UpdateQuizInput = {
  title?: string
  userInstructions?: string | null
  isTimerEnabled?: boolean
  timerDuration?: number | null
  type?: QuestionType | null
}

export const getQuizzes = async ({ userId, limit = 20, offset = 0 }: GetQuizzesParams) => {
  const whereClause = userId ? eq(quizzes.userId, userId) : undefined

  const items = await db
    .select()
    .from(quizzes)
    .where(whereClause)
    .orderBy(desc(quizzes.createdAt))
    .limit(limit)
    .offset(offset)

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(quizzes)
    .where(whereClause)

  return {
    items,
    total: countRow?.total ?? 0,
  }
}

export const getQuizById = async (id: string, userId?: string) => {
  const whereClause = userId
    ? and(eq(quizzes.id, id), eq(quizzes.userId, userId))
    : eq(quizzes.id, id)

  const [quiz] = await db.select().from(quizzes).where(whereClause).limit(1)
  return quiz ?? null
}

export const updateQuizById = async (id: string, data: UpdateQuizInput, userId?: string) => {
  const whereClause = userId
    ? and(eq(quizzes.id, id), eq(quizzes.userId, userId))
    : eq(quizzes.id, id)

  const [updatedQuiz] = await db
    .update(quizzes)
    .set({
      title: data.title,
      userInstructions: data.userInstructions,
      isTimerEnabled: data.isTimerEnabled,
      timerDuration: data.timerDuration,
      type: data.type,
    })
    .where(whereClause)
    .returning()

  return updatedQuiz ?? null
}

export const deleteQuizById = async (id: string, userId?: string) => {
  const whereClause = userId
    ? and(eq(quizzes.id, id), eq(quizzes.userId, userId))
    : eq(quizzes.id, id)

  const deletedRows = await db.delete(quizzes).where(whereClause).returning({ id: quizzes.id })
  return deletedRows.length > 0
}
