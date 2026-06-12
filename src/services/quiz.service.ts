import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm'

import { db } from '../database/database'
import { questionOptions, questions, quizJobs, quizzes } from '../database/schema'
import type { QuestionType } from '../types/questionTypes'

type GetQuizzesParams = {
  userId: string
  limit?: number
  offset?: number
  /** Case-insensitive substring search on quiz title */
  search?: string
  /** Filter to quizzes matching any of these question types */
  types?: QuestionType[]
  /** Sort by creation date: newest first (default) or oldest first */
  sort?: 'newest' | 'oldest'
}

type UpdateQuizInput = {
  title?: string
  userInstructions?: string | null
  isTimerEnabled?: boolean
  timerDuration?: number | null
  type?: QuestionType | null
}

/**
 * Fetch a paginated list of quizzes for a user.
 * Uses a single query with a window function to avoid a separate count query.
 */
export const getQuizzes = async ({
  userId,
  limit = 20,
  offset = 0,
  search,
  types,
  sort = 'newest',
}: GetQuizzesParams) => {
  const conditions = [eq(quizzes.userId, userId)]
  if (search) conditions.push(ilike(quizzes.title, `%${search}%`))
  if (types && types.length > 0) conditions.push(inArray(quizzes.type, types))

  const orderBy = sort === 'oldest' ? asc(quizzes.createdAt) : desc(quizzes.createdAt)

  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      userId: quizzes.userId,
      type: quizzes.type,
      properties: quizzes.properties,
      isTimerEnabled: quizzes.isTimerEnabled,
      timerDuration: quizzes.timerDuration,
      userInstructions: quizzes.userInstructions,
      tokenUsage: quizzes.tokenUsage,
      completedAt: quizzes.completedAt,
      createdAt: quizzes.createdAt,
      uploadedAt: quizzes.uploadedAt,
      updatedAt: quizzes.updatedAt,
      total: sql<number>`count(*) OVER()`.as('total'),
    })
    .from(quizzes)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  const total = rows[0]?.total ?? 0
  const items = rows.map(({ total: _total, ...rest }) => rest)

  return { items, total }
}

export const getQuizById = async (id: string, userId: string) => {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)))
    .limit(1)

  if (!quiz) return null

  const questionRows = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, id))
    .orderBy(questions.position)

  const questionIds = questionRows.map((q) => q.id)

  const optionRows =
    questionIds.length > 0
      ? await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(questionOptions.position)
      : []

  const optionsByQuestion = optionRows.reduce<Record<string, typeof optionRows>>((acc, option) => {
    if (!acc[option.questionId]) acc[option.questionId] = []
    acc[option.questionId].push(option)
    return acc
  }, {})

  return {
    ...quiz,
    questions: questionRows.map((q) => ({
      ...q,
      options: optionsByQuestion[q.id] ?? [],
    })),
  }
}

export const updateQuizById = async (id: string, data: UpdateQuizInput, userId: string) => {
  const [updatedQuiz] = await db
    .update(quizzes)
    .set({
      title: data.title,
      userInstructions: data.userInstructions,
      isTimerEnabled: data.isTimerEnabled,
      timerDuration: data.timerDuration,
      type: data.type,
    })
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)))
    .returning()

  return updatedQuiz ?? null
}

export const deleteQuizById = async (id: string, userId: string) => {
  const deletedRows = await db
    .delete(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)))
    .returning({ id: quizzes.id })

  return deletedRows.length > 0
}

export const getJobById = async (jobId: string, userId: string) => {
  const [job] = await db
    .select()
    .from(quizJobs)
    .where(and(eq(quizJobs.id, jobId), eq(quizJobs.userId, userId)))
    .limit(1)

  return job ?? null
}

export const getPublicQuizByToken = async (shareToken: string) => {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.shareToken, shareToken), eq(quizzes.isPublic, true)))
    .limit(1)

  if (!quiz) return null

  const questionRows = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quiz.id))
    .orderBy(questions.position)

  const questionIds = questionRows.map((q) => q.id)

  const optionRows =
    questionIds.length > 0
      ? await db
          .select({
            id: questionOptions.id,
            questionId: questionOptions.questionId,
            text: questionOptions.text,
            position: questionOptions.position,
          })
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(questionOptions.position)
      : []
  const optionsByQuestion = optionRows.reduce<Record<string, typeof optionRows>>((acc, option) => {
    if (!acc[option.questionId]) acc[option.questionId] = []
    acc[option.questionId].push(option)
    return acc
  }, {})

  return {
    ...quiz,
    questions: questionRows.map((q) => ({ ...q, options: optionsByQuestion[q.id] ?? [] })),
  }
}
export const setQuizSharing = async (id: string, userId: string, isPublic: boolean) => {
  const [updatedQuiz] = await db
    .update(quizzes)
    .set({
      isPublic,
      shareToken: isPublic
        ? sql.raw('COALESCE(share_token, gen_random_uuid()::text)')
        : quizzes.shareToken,
      updatedAt: new Date(),
    })
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)))
    .returning({
      id: quizzes.id,
      isPublic: quizzes.isPublic,
      shareToken: quizzes.shareToken,
    })

  return updatedQuiz ?? null
}
