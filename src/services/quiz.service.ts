import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm'

import { db } from '../database/database'
import {
  questionOptions,
  questions,
  quizJobs,
  quizResults,
  quizzes,
  userAnswers,
} from '../database/schema'
import { AppError } from '../helpers/AppError'
import type { QuestionType } from '../types/questionTypes'

type GetQuizzesParams = {
  userId: string
  limit?: number
  offset?: number
  /** Case-insensitive substring search on quiz title */
  search?: string
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
export const getQuizzes = async ({ userId, limit = 20, offset = 0, search }: GetQuizzesParams) => {
  const whereClause = search
    ? and(eq(quizzes.userId, userId), ilike(quizzes.title, `%${search}%`))
    : eq(quizzes.userId, userId)

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
      completedAt: quizzes.completedAt,
      createdAt: quizzes.createdAt,
      uploadedAt: quizzes.uploadedAt,
      updatedAt: quizzes.updatedAt,
      total: sql<number>`count(*) OVER()`.as('total'),
    })
    .from(quizzes)
    .where(whereClause)
    .orderBy(desc(quizzes.createdAt))
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

type SubmitAnswerInput = {
  questionId: string
  selectedOptionId?: string
  textAnswer?: string
}

export const submitQuiz = async (quizId: string, userId: string, answers: SubmitAnswerInput[]) => {
  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
    .limit(1)

  if (!quiz) return null

  const quizQuestions = await db
    .select({ id: questions.id, type: questions.type })
    .from(questions)
    .where(eq(questions.quizId, quizId))

  if (quizQuestions.length === 0) {
    throw new AppError('Quiz has no questions to submit', 400, 'VALIDATION_ERROR')
  }

  const questionsById = new Map(quizQuestions.map((q) => [q.id, q]))

  const selectedOptionIds: string[] = []
  const processedQuestionIds = new Set<string>()

  for (const answer of answers) {
    if (!questionsById.has(answer.questionId)) {
      throw new AppError(
        `Question ${answer.questionId} does not belong to this quiz`,
        400,
        'VALIDATION_ERROR',
      )
    }

    if (processedQuestionIds.has(answer.questionId)) continue
    processedQuestionIds.add(answer.questionId)

    if (answer.selectedOptionId) {
      selectedOptionIds.push(answer.selectedOptionId)
    }
  }

  const optionRows =
    selectedOptionIds.length > 0
      ? await db
          .select({
            id: questionOptions.id,
            questionId: questionOptions.questionId,
            isCorrect: questionOptions.isCorrect,
          })
          .from(questionOptions)
          .where(inArray(questionOptions.id, selectedOptionIds))
      : []

  const optionsById = new Map(optionRows.map((o) => [o.id, o]))

  let correctAnswers = 0
  const gradableQuestionIds = new Set(
    quizQuestions.filter((q) => q.type !== 'open_ended').map((q) => q.id),
  )
  const scoredQuestions = new Set<string>()

  for (const answer of answers) {
    if (scoredQuestions.has(answer.questionId)) continue

    if (!answer.selectedOptionId) {
      scoredQuestions.add(answer.questionId)
      continue
    }

    const option = optionsById.get(answer.selectedOptionId)
    if (!option || option.questionId !== answer.questionId) {
      throw new AppError(
        `Option ${answer.selectedOptionId} does not belong to question ${answer.questionId}`,
        400,
        'VALIDATION_ERROR',
      )
    }

    if (gradableQuestionIds.has(answer.questionId) && option.isCorrect) {
      correctAnswers += 1
    }

    scoredQuestions.add(answer.questionId)
  }

  const totalQuestions = gradableQuestionIds.size
  const wrongAnswers = totalQuestions - correctAnswers

  const result = await db.transaction(async (tx) => {
    const answerValues = answers.map((answer) => ({
      userId,
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId ?? null,
      textAnswer: answer.textAnswer ?? null,
      updatedAt: new Date(),
    }))
    await tx
      .insert(userAnswers)
      .values(answerValues)
      .onConflictDoUpdate({
        target: [userAnswers.userId, userAnswers.questionId],
        set: {
          selectedOptionId: sql`excluded.selected_option_id`,
          textAnswer: sql`excluded.text_answer`,
          updatedAt: new Date(),
        },
      })

    const [resultRow] = await tx
      .insert(quizResults)
      .values({
        userId,
        quizId,
        totalQuestions,
        correctAnswers,
        wrongAnswers,
      })
      .onConflictDoUpdate({
        target: [quizResults.userId, quizResults.quizId],
        set: { totalQuestions, correctAnswers, wrongAnswers },
      })
      .returning()

    await tx.update(quizzes).set({ completedAt: new Date() }).where(eq(quizzes.id, quizId))

    return resultRow
  })

  return result
}

export const getJobById = async (jobId: string, userId: string) => {
  const [job] = await db
    .select()
    .from(quizJobs)
    .where(and(eq(quizJobs.id, jobId), eq(quizJobs.userId, userId)))
    .limit(1)

  return job ?? null
}
