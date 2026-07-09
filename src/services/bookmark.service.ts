import { and, desc, eq, inArray } from 'drizzle-orm'

import { db } from '../database/database'
import { questionBookmarks, questionOptions, questions, quizzes } from '../database/schema'
import { AppError } from '../helpers/AppError'

/**
 * Detect a PostgreSQL unique-constraint violation (SQLSTATE 23505).
 * The `pg` driver surfaces the code on the error object.
 */
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as Record<string, unknown>).code === '23505'

// ─────────────────────────────────────────────────────────────────────────────
// Add / Remove
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a bookmark for `questionId` owned by `userId`.
 *
 * Access rule: the question must belong to a quiz that is owned by the user
 * (`quizzes.userId = userId`). This covers:
 *   - Quizzes the user generated themselves.
 *   - Quizzes the user imported from the Marketplace (cloneSharedQuiz writes
 *     a new quiz row with `userId = importerId`).
 *
 * A user browsing a public quiz via share token without importing it will hit
 * the 403 guard below.
 *
 * @throws {AppError} 403  – question is not in the user's library
 * @throws {AppError} 409  – question is already bookmarked
 */
export const addBookmark = async (userId: string, questionId: string): Promise<void> => {
  const [question] = await db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
    .where(and(eq(questions.id, questionId), eq(quizzes.userId, userId)))
    .limit(1)

  if (!question) {
    throw new AppError(
      'Question not found or not in your library. Import the quiz first to bookmark its questions.',
      403,
      'FORBIDDEN',
    )
  }

  try {
    await db.insert(questionBookmarks).values({ userId, questionId })
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new AppError('Question is already bookmarked', 409, 'CONFLICT')
    }
    throw err
  }
}

/**
 * Remove a bookmark.
 *
 * @throws {AppError} 404 – bookmark does not exist for this user + question pair
 */
export const removeBookmark = async (userId: string, questionId: string): Promise<void> => {
  const deleted = await db
    .delete(questionBookmarks)
    .where(and(eq(questionBookmarks.userId, userId), eq(questionBookmarks.questionId, questionId)))
    .returning({ id: questionBookmarks.id })

  if (deleted.length === 0) {
    throw new AppError('Bookmark not found', 404, 'NOT_FOUND')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List (with embedded answers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all bookmarked questions for `userId` with answers already embedded
 * so the client can render each card in a single fetch.
 *
 * For MCQ / true-false / multi-select questions the correct option(s) are
 * returned in `correctOptions` (id, text, explanation).
 * For open-ended questions `correctOptions` is empty and `modelAnswer` carries
 * the model's suggested answer text (the `isCorrect=true` option row's text).
 *
 * Uses two queries to avoid a many-to-many fan-out:
 *   1. Bookmark rows joined with questions + quizzes (1 row per bookmark).
 *   2. Correct option rows for all those question ids (1 row per correct opt).
 * Results are merged in-process.
 */
export const getBookmarks = async (userId: string, limit = 50, offset = 0) => {
  // ── 1. Bookmark + question + quiz metadata ───────────────────────────────
  const bookmarkRows = await db
    .select({
      bookmarkId: questionBookmarks.id,
      bookmarkedAt: questionBookmarks.createdAt,
      questionId: questions.id,
      questionText: questions.text,
      questionType: questions.type,
      quizId: quizzes.id,
      quizTitle: quizzes.title,
    })
    .from(questionBookmarks)
    .innerJoin(questions, eq(questions.id, questionBookmarks.questionId))
    .innerJoin(quizzes, eq(quizzes.id, questions.quizId))
    .where(eq(questionBookmarks.userId, userId))
    .orderBy(desc(questionBookmarks.createdAt))
    .limit(limit)
    .offset(offset)

  if (bookmarkRows.length === 0) return []

  // ── 2. All options for all bookmarked questions ─────────────────────────
  const questionIds = bookmarkRows.map((r) => r.questionId)

  const optionRows = await db
    .select({
      questionId: questionOptions.questionId,
      id: questionOptions.id,
      text: questionOptions.text,
      explanation: questionOptions.explanation,
      isCorrect: questionOptions.isCorrect,
    })
    .from(questionOptions)
    .where(inArray(questionOptions.questionId, questionIds))
    .orderBy(questionOptions.position)

  // Index options by questionId for O(1) lookup
  const optionsByQuestion = new Map<string, typeof optionRows>()
  for (const opt of optionRows) {
    const list = optionsByQuestion.get(opt.questionId) ?? []
    list.push(opt)
    optionsByQuestion.set(opt.questionId, list)
  }

  // ── 3. Assemble response ────────────────────────────────────────────────
  return bookmarkRows.map((row) => {
    const opts = optionsByQuestion.get(row.questionId) ?? []
    const isOpenEnded = row.questionType === 'open_ended'

    const correctOptions: { id: string; text: string; explanation: string | null }[] = []
    const options: { id: string; text: string }[] = []
    let modelAnswer: string | null = null

    for (const o of opts) {
      if (!isOpenEnded) {
        options.push({ id: o.id, text: o.text })
        if (o.isCorrect) {
          correctOptions.push({ id: o.id, text: o.text, explanation: o.explanation })
        }
      } else if (o.isCorrect) {
        modelAnswer = o.text
      }
    }

    return {
      bookmarkId: row.bookmarkId,
      bookmarkedAt: row.bookmarkedAt,
      quiz: {
        id: row.quizId,
        title: row.quizTitle,
      },
      question: {
        id: row.questionId,
        text: row.questionText,
        type: row.questionType,
        correctOptions,
        options,
        modelAnswer,
      },
    }
  })
}
