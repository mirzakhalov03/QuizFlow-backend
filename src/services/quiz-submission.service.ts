import { and, eq, inArray } from 'drizzle-orm'

import { gradeOpenEndedAnswers } from './open-ended-grading.service'
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
const scoreAnswers = (
  quizQuestions: QuizQuestion[],
  answers: SubmitAnswerInput[],
  optionsById: Map<string, SelectedOption>,
  correctOptionIdsByQuestion: Map<string, Set<string>>,
): ScoreResult => {
  // Classify question ids by how they're graded.
  const singleChoiceIds = new Set<string>()
  const multiSelectIds = new Set<string>()
  const openEndedIds = new Set<string>()
  for (const q of quizQuestions) {
    if (q.type === 'open_ended') openEndedIds.add(q.id)
    else if (q.type === 'multi_select') multiSelectIds.add(q.id)
    else singleChoiceIds.add(q.id)
  }

  const correctnessByQuestion = new Map<string, boolean>()

  // All auto-gradable questions (single-choice + multi-select) default to
  // incorrect unless the answer proves otherwise.
  for (const qId of singleChoiceIds) correctnessByQuestion.set(qId, false)
  for (const qId of multiSelectIds) correctnessByQuestion.set(qId, false)

  // Open-ended: unanswered -> incorrect now; answered -> stays out of this map
  // (null/pending) until the async grader fills it in.
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

  const optionRows =
    referencedOptionIds.length > 0
      ? await db
          .select({
            id: questionOptions.id,
            questionId: questionOptions.questionId,
            isCorrect: questionOptions.isCorrect,
          })
          .from(questionOptions)
          .where(inArray(questionOptions.id, referencedOptionIds))
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

  const quizQuestionIds = quizQuestions.map((q) => q.id)
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

    // This submission is the authoritative attempt: replace any prior answers
    // for this quiz so questions left unanswered now don't keep stale answers
    // (and stale grading verdicts) from an earlier submission.
    await tx
      .delete(userAnswers)
      .where(and(eq(userAnswers.userId, userId), inArray(userAnswers.questionId, quizQuestionIds)))

    if (answerValues.length > 0) {
      await tx.insert(userAnswers).values(answerValues)
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

  // Fire-and-forget: grade open-ended answers in the background so submit stays
  // instant. The grader sets gradingStatus='failed' on handled errors; the
  // .catch here is the safety net for anything that escapes (e.g. a DB blip in
  // its setup queries) so a detached rejection can't crash the process.
  if (gradingStatus === 'pending') {
    gradeOpenEndedAnswers(quizId, userId).catch((err) =>
      logger.error('Open-ended grading unhandled rejection', {
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }

  return result
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
