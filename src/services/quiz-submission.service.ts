import { and, eq, inArray } from 'drizzle-orm'

import { gradeOpenEndedAnswers } from './open-ended-grading.service'
import { db } from '../database/database'
import { questionOptions, questions, quizResults, quizzes, userAnswers } from '../database/schema'
import { AppError } from '../helpers/AppError'
import type { QuestionType } from '../types/questionTypes'

type SubmitAnswerInput = {
  questionId: string
  selectedOptionId?: string
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
 * Auto-gradable questions (multiple-choice, true/false) are scored here.
 * Open-ended questions count toward `totalQuestions` from submit time (stable
 * denominator) but start as not-yet-correct — the async grader adds them later.
 * Throws if a selected option does not belong to its question.
 */
const scoreAnswers = (
  quizQuestions: QuizQuestion[],
  answers: SubmitAnswerInput[],
  optionsById: Map<string, SelectedOption>,
): ScoreResult => {
  const autoGradableIds = new Set(
    quizQuestions.filter((q) => q.type !== 'open_ended').map((q) => q.id),
  )
  const openEndedIds = new Set(
    quizQuestions.filter((q) => q.type === 'open_ended').map((q) => q.id),
  )

  const correctnessByQuestion = new Map<string, boolean>()
  const scoredQuestions = new Set<string>()
  let correctAnswers = 0

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

    if (autoGradableIds.has(answer.questionId)) {
      correctnessByQuestion.set(answer.questionId, option.isCorrect)
      if (option.isCorrect) correctAnswers += 1
    }

    scoredQuestions.add(answer.questionId)
  }

  const totalQuestions = autoGradableIds.size + openEndedIds.size
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

  // First pass: validate every answer targets a question in this quiz and
  // collect the (deduped) option ids we need to fetch for scoring.
  const selectedOptionIds: string[] = []
  const seenQuestionIds = new Set<string>()

  for (const answer of answers) {
    if (!questionsById.has(answer.questionId)) {
      throw new AppError(
        `Question ${answer.questionId} does not belong to this quiz`,
        400,
        'VALIDATION_ERROR',
      )
    }

    if (seenQuestionIds.has(answer.questionId)) continue
    seenQuestionIds.add(answer.questionId)

    if (answer.selectedOptionId) selectedOptionIds.push(answer.selectedOptionId)
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

  const { correctnessByQuestion, correctAnswers, totalQuestions, wrongAnswers, gradingStatus } =
    scoreAnswers(quizQuestions, answers, optionsById)

  const quizQuestionIds = quizQuestions.map((q) => q.id)

  const result = await db.transaction(async (tx) => {
    const answerValues = answers.map((answer) => ({
      userId,
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId ?? null,
      textAnswer: answer.textAnswer ?? null,
      isCorrect: correctnessByQuestion.has(answer.questionId)
        ? correctnessByQuestion.get(answer.questionId)!
        : null,
      updatedAt: new Date(),
    }))

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

  // Fire-and-forget: grade open-ended answers in the background so submit stays
  // instant. The grader sets gradingStatus='failed' on handled errors; the
  // .catch here is the safety net for anything that escapes (e.g. a DB blip in
  // its setup queries) so a detached rejection can't crash the process.
  if (gradingStatus === 'pending') {
    gradeOpenEndedAnswers(quizId, userId).catch((err) =>
      console.error('[openEndedGrading] unhandled rejection:', err),
    )
  }

  return result
}

export const getQuizResult = async (quizId: string, userId: string) => {
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

  if (!result) return null

  // Per-answer verdicts for graded questions (open-ended). isCorrect is null
  // until graded, so only non-null rows are returned.
  const verdictRows = await db
    .select({
      questionId: userAnswers.questionId,
      isCorrect: userAnswers.isCorrect,
    })
    .from(userAnswers)
    .innerJoin(questions, eq(questions.id, userAnswers.questionId))
    .where(and(eq(questions.quizId, quizId), eq(userAnswers.userId, userId)))

  const verdicts = verdictRows
    .filter((r) => r.isCorrect !== null)
    .map((r) => ({ questionId: r.questionId, isCorrect: r.isCorrect as boolean }))

  return { result, verdicts }
}
