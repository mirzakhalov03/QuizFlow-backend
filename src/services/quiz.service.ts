import { and, asc, desc, eq, ilike, inArray, sql, or, isNull, ne } from 'drizzle-orm'

import { db } from '../database/database'
import { folders, questionOptions, questions, quizJobs, quizzes, users } from '../database/schema'
import { AppError } from '../helpers/AppError'
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
  folderId?: string | null
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
      folderId: quizzes.folderId,
      type: quizzes.type,
      isPublic: quizzes.isPublic,
      shareToken: quizzes.shareToken,
      properties: quizzes.properties,
      isTimerEnabled: quizzes.isTimerEnabled,
      timerDuration: quizzes.timerDuration,
      userInstructions: quizzes.userInstructions,
      tokenUsage: quizzes.tokenUsage,
      completedAt: quizzes.completedAt,
      createdAt: quizzes.createdAt,
      uploadedAt: quizzes.uploadedAt,
      updatedAt: quizzes.updatedAt,
      apiKeyId: quizJobs.apiKeyId,
      apiKeyName: quizJobs.apiKeyName,
      total: sql<number>`count(*) OVER()`.as('total'),
    })
    .from(quizzes)
    .leftJoin(quizJobs, eq(quizzes.id, quizJobs.quizId))
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
    .select({
      quiz: quizzes,
      question: questions,
      option: questionOptions,
      apiKeyId: quizJobs.apiKeyId,
      apiKeyName: quizJobs.apiKeyName,
    })
    .from(quizzes)
    .leftJoin(quizJobs, eq(quizzes.id, quizJobs.quizId))
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

  return {
    ...rows[0].quiz,
    apiKeyId: rows[0].apiKeyId,
    apiKeyName: rows[0].apiKeyName,
    questions: [...questionsById.values()],
  }
}

export const updateQuizById = async (id: string, data: UpdateQuizInput, userId: string) => {
  if (data.folderId) {
    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, data.folderId), eq(folders.userId, userId)))
      .limit(1)

    if (!folder) {
      throw new AppError('Folder not found', 404, 'NOT_FOUND')
    }
  }

  const [updatedQuiz] = await db
    .update(quizzes)
    .set({
      title: data.title,
      userInstructions: data.userInstructions,
      isTimerEnabled: data.isTimerEnabled,
      timerDuration: data.timerDuration,
      type: data.type,
      folderId: data.folderId,
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

export const getPublicQuizByToken = async (shareToken: string, viewerId?: string) => {
  // Single round-trip. Public consumers must never see the answer key, so option
  // columns are restricted to the safe four — no `isCorrect`, no `explanation`.
  // The quiz projection is likewise narrowed: never leak `userId` or `properties`
  // (which holds the source S3 bucket/key). We expose only the owner's display
  // name for attribution. This projection is load-bearing.
  const rows = await db
    .select({
      quiz: {
        id: quizzes.id,
        title: quizzes.title,
        userInstructions: quizzes.userInstructions,
        type: quizzes.type,
        isTimerEnabled: quizzes.isTimerEnabled,
        timerDuration: quizzes.timerDuration,
      },
      // Used only to derive `isOwner` below; never spread into the response.
      ownerId: quizzes.userId,
      ownerName: users.fullName,
      question: questions,
      option: {
        id: questionOptions.id,
        questionId: questionOptions.questionId,
        text: questionOptions.text,
        position: questionOptions.position,
      },
    })
    .from(quizzes)
    .leftJoin(users, eq(users.id, quizzes.userId))
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
    // Open-ended questions should not expose their options (model answers) to public consumers.
    if (row.option && row.option.id !== null && row.question.type !== 'open_ended') {
      q.options.push(row.option as PublicOption)
    }
  }

  return {
    ...rows[0].quiz,
    // True only for the authenticated owner — lets the frontend redirect them to
    // their own (full-featured) copy instead of the read-only public view.
    isOwner: viewerId != null && rows[0].ownerId === viewerId,
    owner: { fullName: rows[0].ownerName ?? 'A QuizFlow user' },
    questions: [...questionsById.values()],
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

/**
 * Copies a public quiz (its questions + options) into a brand-new quiz owned by
 * `userId`. The clone is private (isPublic=false, fresh shareToken auto-assigned
 * by the column default), unfiled, and not yet completed. Source S3 references in
 * `properties` are intentionally dropped. Returns null if the token is not public.
 */
export const cloneSharedQuiz = async (shareToken: string, userId: string) => {
  const [source] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.shareToken, shareToken), eq(quizzes.isPublic, true)))
    .limit(1)

  if (!source) return null

  const sourceQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, source.id))
    .orderBy(asc(questions.position))

  const questionIds = sourceQuestions.map((q) => q.id)
  const sourceOptions =
    questionIds.length > 0
      ? await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(asc(questionOptions.position))
      : []

  const optionsByQuestion = new Map<string, typeof sourceOptions>()
  for (const o of sourceOptions) {
    const arr = optionsByQuestion.get(o.questionId) ?? []
    arr.push(o)
    optionsByQuestion.set(o.questionId, arr)
  }

  const newQuizId = await db.transaction(async (tx) => {
    const [newQuiz] = await tx
      .insert(quizzes)
      .values({
        title: source.title,
        userId,
        type: source.type,
        difficulty: source.difficulty,
        isPublic: false,
        properties: { generatedBy: 'clone' },
        isTimerEnabled: source.isTimerEnabled,
        timerDuration: source.timerDuration,
        userInstructions: source.userInstructions,
      })
      .returning({ id: quizzes.id })

    for (const q of sourceQuestions) {
      const [newQuestion] = await tx
        .insert(questions)
        .values({
          quizId: newQuiz.id,
          text: q.text,
          type: q.type,
          position: q.position,
        })
        .returning({ id: questions.id })

      const opts = optionsByQuestion.get(q.id) ?? []
      if (opts.length > 0) {
        await tx.insert(questionOptions).values(
          opts.map((o) => ({
            questionId: newQuestion.id,
            text: o.text,
            explanation: o.explanation,
            isCorrect: o.isCorrect,
            position: o.position,
          })),
        )
      }
    }

    return newQuiz.id
  })

  return { id: newQuizId }
}
