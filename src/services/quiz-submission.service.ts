import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  gradeOpenEndedAnswers,
  gradeOpenEndedBatch,
  type OpenEndedGradeRow,
} from './open-ended-grading.service'
import { logger } from '../config/logger'
import { db } from '../database/database'
import { questionOptions, questions, quizResults, quizzes, userAnswers } from '../database/schema'
import { AppError } from '../helpers/AppError'
import type { QuestionType } from '../types/questionTypes'

type SubmitAnswerInput = {
  questionId: string
  selectedOptionId?: string
  selectedOptionIds?: string[]
  textAnswer?: string
}

type QuizQuestion = { id: string; type: QuestionType }
type SelectedOption = { id: string; questionId: string; isCorrect: boolean }

type ScoreResult = {
  /** Per-answer correctness for auto-gradable questions; open-ended stay absent
   *  (null in the DB) until the async grader fills them in. */
  correctnessByQuestion: Map<string, boolean>
  correctAnswers: number
  totalQuestions: number
  wrongAnswers: number
  gradingStatus: 'pending' | 'complete'
}

/**
 * Pure scoring: given the quiz's questions, the submitted answers, and the
 * selected options, compute per-question correctness and the result totals.
 *
 * Auto-gradable questions are scored here: single-choice (multiple-choice,
 * true/false) by the chosen option, and multi-select by exact set match against
 * `correctOptionIdsByQuestion` (every correct option chosen, no incorrect one).
 * Open-ended questions count toward `totalQuestions` from submit time (stable
 * denominator) but start as not-yet-correct — the async grader adds them later.
 * Assumes `answers` is already deduped (at most one entry per question).
 * Throws if a selected option does not belong to its question.
 */
export const scoreAnswers = (
  quizQuestions: QuizQuestion[],
  answers: SubmitAnswerInput[],
  optionsById: Map<string, SelectedOption>,
  correctOptionIdsByQuestion: Map<string, Set<string>>,
): ScoreResult => {
  const singleChoiceIds = new Set<string>()
  const multiSelectIds = new Set<string>()
  const openEndedIds = new Set<string>()
  const correctnessByQuestion = new Map<string, boolean>()

  for (const q of quizQuestions) {
    if (q.type === 'open_ended') {
      openEndedIds.add(q.id)
    } else {
      correctnessByQuestion.set(q.id, false)
      if (q.type === 'multi_select') multiSelectIds.add(q.id)
      else singleChoiceIds.add(q.id)
    }
  }

  const answersByQuestion = new Map(answers.map((a) => [a.questionId, a]))
  for (const qId of openEndedIds) {
    const answer = answersByQuestion.get(qId)
    if (!answer || !answer.textAnswer || answer.textAnswer.trim().length === 0) {
      correctnessByQuestion.set(qId, false)
    }
  }

  let correctAnswers = 0

  for (const answer of answers) {
    if (singleChoiceIds.has(answer.questionId)) {
      if (!answer.selectedOptionId) continue

      const option = optionsById.get(answer.selectedOptionId)
      if (!option || option.questionId !== answer.questionId) {
        throw new AppError(
          `Option ${answer.selectedOptionId} does not belong to question ${answer.questionId}`,
          400,
          'VALIDATION_ERROR',
        )
      }

      correctnessByQuestion.set(answer.questionId, option.isCorrect)
      if (option.isCorrect) correctAnswers += 1
    } else if (multiSelectIds.has(answer.questionId)) {
      const submitted = answer.selectedOptionIds ?? []
      if (submitted.length === 0) continue

      // Every submitted option must belong to this question.
      for (const optId of submitted) {
        const option = optionsById.get(optId)
        if (!option || option.questionId !== answer.questionId) {
          throw new AppError(
            `Option ${optId} does not belong to question ${answer.questionId}`,
            400,
            'VALIDATION_ERROR',
          )
        }
      }

      // Exact match: the submitted set equals the correct set exactly.
      const submittedSet = new Set(submitted)
      const correctSet = correctOptionIdsByQuestion.get(answer.questionId) ?? new Set<string>()
      const isCorrect =
        submittedSet.size === correctSet.size && [...submittedSet].every((id) => correctSet.has(id))

      correctnessByQuestion.set(answer.questionId, isCorrect)
      if (isCorrect) correctAnswers += 1
    }
  }

  const totalQuestions = singleChoiceIds.size + multiSelectIds.size + openEndedIds.size
  const wrongAnswers = totalQuestions - correctAnswers

  const hasOpenEndedToGrade = answers.some(
    (a) => openEndedIds.has(a.questionId) && a.textAnswer && a.textAnswer.trim().length > 0,
  )

  return {
    correctnessByQuestion,
    correctAnswers,
    totalQuestions,
    wrongAnswers,
    gradingStatus: hasOpenEndedToGrade ? 'pending' : 'complete',
  }
}

export const submitQuiz = async (
  quizId: string,
  userId: string,
  rawAnswers: SubmitAnswerInput[],
) => {
  logger.info('Submitting quiz', { quizId, userId, answerCount: rawAnswers.length })
  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
    .limit(1)

  if (!quiz) {
    logger.warn('Quiz not found for submission', { quizId, userId })
    return null
  }

  // Keep only the first answer per question. A client could send duplicates,
  // and (userId, questionId) is unique — duplicates would break the insert below.
  const seenQuestionIds = new Set<string>()
  const answers = rawAnswers.filter((answer) => {
    if (seenQuestionIds.has(answer.questionId)) return false
    seenQuestionIds.add(answer.questionId)
    return true
  })

  const quizQuestions = await db
    .select({ id: questions.id, type: questions.type })
    .from(questions)
    .where(eq(questions.quizId, quizId))

  if (quizQuestions.length === 0) {
    throw new AppError('Quiz has no questions to submit', 400, 'VALIDATION_ERROR')
  }

  const questionsById = new Map(quizQuestions.map((q) => [q.id, q]))

  // Validate every answer targets a question in this quiz and collect the
  // option ids we need to fetch for scoring (single + multi-select).
  const referencedOptionIds: string[] = []

  for (const answer of answers) {
    if (!questionsById.has(answer.questionId)) {
      throw new AppError(
        `Question ${answer.questionId} does not belong to this quiz`,
        400,
        'VALIDATION_ERROR',
      )
    }

    if (answer.selectedOptionId) referencedOptionIds.push(answer.selectedOptionId)
    if (answer.selectedOptionIds) referencedOptionIds.push(...answer.selectedOptionIds)
  }

  const uniqueReferencedOptionIds = [...new Set(referencedOptionIds)]

  const optionRows =
    uniqueReferencedOptionIds.length > 0
      ? await db
          .select({
            id: questionOptions.id,
            questionId: questionOptions.questionId,
            isCorrect: questionOptions.isCorrect,
          })
          .from(questionOptions)
          .where(inArray(questionOptions.id, uniqueReferencedOptionIds))
      : []

  const optionsById = new Map(optionRows.map((o) => [o.id, o]))

  // Exact-match scoring needs the full correct set per multi-select question,
  // not just the options the user picked.
  const multiSelectQuestionIds = quizQuestions
    .filter((q) => q.type === 'multi_select')
    .map((q) => q.id)

  const correctOptionIdsByQuestion = new Map<string, Set<string>>()
  if (multiSelectQuestionIds.length > 0) {
    const correctRows = await db
      .select({ id: questionOptions.id, questionId: questionOptions.questionId })
      .from(questionOptions)
      .where(
        and(
          inArray(questionOptions.questionId, multiSelectQuestionIds),
          eq(questionOptions.isCorrect, true),
        ),
      )

    for (const row of correctRows) {
      const set = correctOptionIdsByQuestion.get(row.questionId) ?? new Set<string>()
      set.add(row.id)
      correctOptionIdsByQuestion.set(row.questionId, set)
    }
  }

  const { correctnessByQuestion, correctAnswers, totalQuestions, wrongAnswers, gradingStatus } =
    scoreAnswers(quizQuestions, answers, optionsById, correctOptionIdsByQuestion)

  const answersByQuestion = new Map(answers.map((a) => [a.questionId, a]))

  const result = await db.transaction(async (tx) => {
    // Record a result for every question in the quiz, ensuring that unanswered
    // questions are explicitly marked as incorrect.
    const answerValues = quizQuestions.map((q) => {
      const answer = answersByQuestion.get(q.id)
      return {
        userId,
        questionId: q.id,
        selectedOptionId: answer?.selectedOptionId ?? null,
        selectedOptionIds: answer?.selectedOptionIds ?? null,
        textAnswer: answer?.textAnswer ?? null,
        isCorrect: correctnessByQuestion.has(q.id) ? correctnessByQuestion.get(q.id)! : null,
        updatedAt: new Date(),
      }
    })

    // This submission is the authoritative attempt. We upsert a row for every
    // question in the quiz (answered or not), so questions left unanswered now
    // overwrite any stale answer/verdict from an earlier submission. Upserting
    // (rather than delete-then-insert) keeps a concurrent double-submit — e.g.
    // two tabs, or a retry — from racing on the (userId, questionId) unique
    // constraint and 500ing.
    if (answerValues.length > 0) {
      await tx
        .insert(userAnswers)
        .values(answerValues)
        .onConflictDoUpdate({
          target: [userAnswers.userId, userAnswers.questionId],
          set: {
            selectedOptionId: sql`excluded.selected_option_id`,
            selectedOptionIds: sql`excluded.selected_option_ids`,
            textAnswer: sql`excluded.text_answer`,
            isCorrect: sql`excluded.is_correct`,
            updatedAt: new Date(),
          },
        })
    }

    const [resultRow] = await tx
      .insert(quizResults)
      .values({
        userId,
        quizId,
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        gradingStatus,
      })
      .onConflictDoUpdate({
        target: [quizResults.userId, quizResults.quizId],
        set: { totalQuestions, correctAnswers, wrongAnswers, gradingStatus },
      })
      .returning()

    await tx.update(quizzes).set({ completedAt: new Date() }).where(eq(quizzes.id, quizId))

    return resultRow
  })

  logger.info('Quiz submitted successfully', { quizId, userId, resultId: result.id })

  // Grade open-ended answers synchronously so the response carries the final
  // score. In-process fire-and-forget didn't survive on serverless — the host
  // froze the process once the response returned, leaving grading stuck in
  // 'pending'. gradeOpenEndedAnswers handles its own errors and settles the
  // status to 'complete'/'failed' (bounded by a 30s LLM timeout), so this
  // never throws; we just re-read the row it updated in place.
  if (gradingStatus === 'pending') {
    await gradeOpenEndedAnswers(quizId, userId)

    const [finalized] = await db
      .select()
      .from(quizResults)
      .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))
      .limit(1)

    if (finalized) return finalized
  }

  return result
}

export type PublicReviewItem = {
  questionId: string
  isCorrect: boolean
  /** Correct option ids for choice/true-false questions (empty for open-ended). */
  correctOptionIds: string[]
  /** Model answer text for open-ended questions only — never the rubric. */
  modelAnswer?: string
}

export type PublicSubmitResult = {
  name: string
  totalQuestions: number
  correctAnswers: number
  wrongAnswers: number
  review: PublicReviewItem[]
}

/**
 * Ephemeral scoring for an anonymous (or logged-in) solver of a public quiz.
 * Grades auto-gradable questions in code and answered open-ended questions via
 * one batched LLM call, then returns the score + a per-question review that
 * reveals the correct option(s)/model answer but NEVER the explanation/rubric.
 * Persists nothing. Returns null if the token is not a public quiz.
 */
export const submitPublicQuiz = async (
  shareToken: string,
  name: string,
  rawAnswers: SubmitAnswerInput[],
): Promise<PublicSubmitResult | null> => {
  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.shareToken, shareToken), eq(quizzes.isPublic, true)))
    .limit(1)

  if (!quiz) return null
  const quizId = quiz.id

  // Keep only the first answer per question (client could send duplicates).
  const seen = new Set<string>()
  const answers = rawAnswers.filter((a) => {
    if (seen.has(a.questionId)) return false
    seen.add(a.questionId)
    return true
  })

  const quizQuestions = await db
    .select({ id: questions.id, type: questions.type, text: questions.text })
    .from(questions)
    .where(eq(questions.quizId, quizId))

  if (quizQuestions.length === 0) {
    throw new AppError('Quiz has no questions to submit', 400, 'VALIDATION_ERROR')
  }

  const questionsById = new Map(quizQuestions.map((q) => [q.id, q]))
  for (const a of answers) {
    if (!questionsById.has(a.questionId)) {
      throw new AppError(
        `Question ${a.questionId} does not belong to this quiz`,
        400,
        'VALIDATION_ERROR',
      )
    }
  }

  // Load every option for the quiz: we need isCorrect (auto-grading + answer key)
  // plus text/explanation for the open-ended model answer + rubric.
  const optionRows = await db
    .select({
      id: questionOptions.id,
      questionId: questionOptions.questionId,
      isCorrect: questionOptions.isCorrect,
      text: questionOptions.text,
      explanation: questionOptions.explanation,
    })
    .from(questionOptions)
    .innerJoin(questions, eq(questions.id, questionOptions.questionId))
    .where(eq(questions.quizId, quizId))

  const optionsById = new Map(
    optionRows.map((o) => [o.id, { id: o.id, questionId: o.questionId, isCorrect: o.isCorrect }]),
  )

  const correctOptionIdsByQuestion = new Map<string, Set<string>>()
  for (const o of optionRows) {
    if (!o.isCorrect) continue
    const set = correctOptionIdsByQuestion.get(o.questionId) ?? new Set<string>()
    set.add(o.id)
    correctOptionIdsByQuestion.set(o.questionId, set)
  }

  const scoreResult = scoreAnswers(
    quizQuestions.map((q) => ({ id: q.id, type: q.type as QuestionType })),
    answers,
    optionsById,
    correctOptionIdsByQuestion,
  )

  // Build open-ended grading rows for answered open-ended questions.
  const answersByQuestion = new Map(answers.map((a) => [a.questionId, a]))
  const openEndedRows: OpenEndedGradeRow[] = []
  for (const q of quizQuestions) {
    if (q.type !== 'open_ended') continue
    const userText = answersByQuestion.get(q.id)?.textAnswer?.trim()
    if (!userText) continue
    const correctOpt = optionRows.find((o) => o.questionId === q.id && o.isCorrect)
    openEndedRows.push({
      questionId: q.id,
      questionText: q.text,
      modelAnswer: correctOpt?.text ?? '',
      rubric: correctOpt?.explanation ?? null,
      userText,
    })
  }

  const openEndedVerdicts = new Map<string, boolean>()
  if (openEndedRows.length > 0) {
    try {
      const verdicts = await gradeOpenEndedBatch(openEndedRows)
      for (const [qId, isCorrect] of verdicts) openEndedVerdicts.set(qId, isCorrect)
    } catch (err) {
      logger.error('Public open-ended grading failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      // Leave openEndedVerdicts empty — handled by the denominator drop below.
    }
  }

  let totalQuestions = scoreResult.totalQuestions
  const openEndedCorrect = [...openEndedVerdicts.values()].filter(Boolean).length
  let correctAnswers = scoreResult.correctAnswers + openEndedCorrect

  // If open-ended grading failed (answered rows but no verdicts came back), drop
  // those questions from the denominator so an LLM outage never penalizes the
  // solver (mirrors the authed path's degrade behavior).
  if (openEndedRows.length > 0 && openEndedVerdicts.size === 0) {
    totalQuestions -= openEndedRows.length
    correctAnswers = scoreResult.correctAnswers
  }

  const wrongAnswers = totalQuestions - correctAnswers

  const review: PublicReviewItem[] = quizQuestions.map((q) => {
    if (q.type === 'open_ended') {
      const correctOpt = optionRows.find((o) => o.questionId === q.id && o.isCorrect)
      return {
        questionId: q.id,
        isCorrect: openEndedVerdicts.get(q.id) ?? false,
        correctOptionIds: [],
        modelAnswer: correctOpt?.text ?? undefined,
      }
    }
    return {
      questionId: q.id,
      isCorrect: scoreResult.correctnessByQuestion.get(q.id) ?? false,
      correctOptionIds: [...(correctOptionIdsByQuestion.get(q.id) ?? new Set<string>())],
    }
  })

  return { name, totalQuestions, correctAnswers, wrongAnswers, review }
}

export const getQuizResult = async (quizId: string, userId: string) => {
  logger.info('Fetching quiz result', { quizId, userId })
  const [result] = await db
    .select({
      id: quizResults.id,
      userId: quizResults.userId,
      quizId: quizResults.quizId,
      totalQuestions: quizResults.totalQuestions,
      correctAnswers: quizResults.correctAnswers,
      wrongAnswers: quizResults.wrongAnswers,
      gradingStatus: quizResults.gradingStatus,
    })
    .from(quizResults)
    .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))
    .limit(1)

  if (!result) {
    logger.warn('Quiz result not found', { quizId, userId })
    return null
  }

  // One pass over the user's stored answers yields both the per-answer verdicts
  // (graded open-ended) and the raw answers used to rebuild the review on refresh.
  const answerRows = await db
    .select({
      questionId: userAnswers.questionId,
      isCorrect: userAnswers.isCorrect,
      selectedOptionId: userAnswers.selectedOptionId,
      selectedOptionIds: userAnswers.selectedOptionIds,
      textAnswer: userAnswers.textAnswer,
    })
    .from(userAnswers)
    .innerJoin(questions, eq(questions.id, userAnswers.questionId))
    .where(and(eq(questions.quizId, quizId), eq(userAnswers.userId, userId)))

  // isCorrect is null until graded, so only non-null rows become verdicts.
  const verdicts = answerRows
    .filter((r) => r.isCorrect !== null)
    .map((r) => ({ questionId: r.questionId, isCorrect: r.isCorrect as boolean }))

  const answers = answerRows.map((r) => ({
    questionId: r.questionId,
    selectedOptionId: r.selectedOptionId ?? undefined,
    selectedOptionIds: (r.selectedOptionIds as string[] | null) ?? undefined,
    textAnswer: r.textAnswer ?? undefined,
  }))

  return { result, verdicts, answers }
}
