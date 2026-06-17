import { and, asc, desc, eq, ilike, inArray, sql, or, isNull, ne } from 'drizzle-orm'

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
  /** Exclude quizzes that belong to this folder ID */
  excludeFolderId?: string
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
  excludeFolderId,
}: GetQuizzesParams) => {
  const conditions = [eq(quizzes.userId, userId)]
  if (search) conditions.push(ilike(quizzes.title, `%${search}%`))
  if (types && types.length > 0) conditions.push(inArray(quizzes.type, types))
  if (excludeFolderId)
    conditions.push(or(ne(quizzes.folderId, excludeFolderId), isNull(quizzes.folderId))!)

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
  // Single round-trip: join questions + options and regroup in code, replacing
  // three sequential queries. ORDER BY drives both the question order and the
  // option order within each question, which the UI relies on.
  const rows = await db
    .select({ quiz: quizzes, question: questions, option: questionOptions })
    .from(quizzes)
    .leftJoin(questions, eq(questions.quizId, quizzes.id))
    .leftJoin(questionOptions, eq(questionOptions.questionId, questions.id))
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)))
    .orderBy(asc(questions.position), asc(questionOptions.position))

  if (rows.length === 0) return null

  type Option = typeof questionOptions.$inferSelect
  type QuestionWithOptions = typeof questions.$inferSelect & { options: Option[] }

  const questionsById = new Map<string, QuestionWithOptions>()
  for (const row of rows) {
    if (!row.question) continue
    let q = questionsById.get(row.question.id)
    if (!q) {
      q = { ...row.question, options: [] }
      questionsById.set(q.id, q)
    }
    if (row.option) q.options.push(row.option)
  }

  return { ...rows[0].quiz, questions: [...questionsById.values()] }
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
  // Single round-trip (see getQuizById). Public consumers must never see the
  // answer key, so option columns are restricted to the safe four — no
  // `isCorrect`, no `explanation` rubric. This projection is load-bearing.
  const rows = await db
    .select({
      quiz: quizzes,
      question: questions,
      option: {
        id: questionOptions.id,
        questionId: questionOptions.questionId,
        text: questionOptions.text,
        position: questionOptions.position,
      },
    })
    .from(quizzes)
    .leftJoin(questions, eq(questions.quizId, quizzes.id))
    .leftJoin(questionOptions, eq(questionOptions.questionId, questions.id))
    .where(and(eq(quizzes.shareToken, shareToken), eq(quizzes.isPublic, true)))
    .orderBy(asc(questions.position), asc(questionOptions.position))

  if (rows.length === 0) return null

  type PublicOption = { id: string; questionId: string; text: string; position: number }
  type QuestionWithOptions = typeof questions.$inferSelect & { options: PublicOption[] }

  const questionsById = new Map<string, QuestionWithOptions>()
  for (const row of rows) {
    if (!row.question) continue
    let q = questionsById.get(row.question.id)
    if (!q) {
      q = { ...row.question, options: [] }
      questionsById.set(q.id, q)
    }
    // A partial-object leftJoin select yields all-null fields when no option
    // row matched, so guard on the id before treating it as a real option.
    if (row.option && row.option.id !== null) q.options.push(row.option as PublicOption)
  }

  return { ...rows[0].quiz, questions: [...questionsById.values()] }
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
