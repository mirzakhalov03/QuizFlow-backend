import { and, eq, inArray, sql } from 'drizzle-orm'

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
  correctnessByQuestion: Map<string, boolean>
  correctAnswers: number
  totalQuestions: number
  wrongAnswers: number
  gradingStatus: 'pending' | 'complete'
}

const scoreAnswers = (
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

    // Manual upsert — avoids onConflictDoUpdate which requires a DB constraint
    const [existingResult] = await tx
      .select({ id: quizResults.id })
      .from(quizResults)
      .where(and(eq(quizResults.userId, userId), eq(quizResults.quizId, quizId)))
      .limit(1)

    let resultRow
    if (existingResult) {
      const [updated] = await tx
        .update(quizResults)
        .set({
          totalQuestions,
          correctAnswers,
          wrongAnswers,
          gradingStatus,
          updatedAt: sql`now()`,
        })
        .where(and(eq(quizResults.userId, userId), eq(quizResults.quizId, quizId)))
        .returning()
      resultRow = updated
    } else {
      const [inserted] = await tx
        .insert(quizResults)
        .values({
          userId,
          quizId,
          totalQuestions,
          correctAnswers,
          wrongAnswers,
          gradingStatus,
        })
        .returning()
      resultRow = inserted
    }

    await tx.update(quizzes).set({ completedAt: new Date() }).where(eq(quizzes.id, quizId))

    return resultRow
  })

  logger.info('Quiz submitted successfully', { quizId, userId, resultId: result.id })

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
