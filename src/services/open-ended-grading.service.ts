import { and, count, eq } from 'drizzle-orm'

import { chatJSON } from './clients/openrouter.client'
import { logger } from '../config/logger'
import { DEFAULT_MODEL } from '../constants/models'
import { db } from '../database/database'
import { questionOptions, questions, quizResults, userAnswers } from '../database/schema'
import { OPEN_ENDED_GRADING_SYSTEM_PROMPT } from '../prompts'

type GradeRow = {
  questionId: string
  questionText: string
  modelAnswer: string
  rubric: string | null
  userText: string | null
}

type LlmGrades = { grades: { index: number; isCorrect: boolean }[] }

const GRADING_TIMEOUT_MS = 30_000

const GRADE_SCHEMA = {
  name: 'open_ended_grades',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['grades'],
    properties: {
      grades: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['index', 'isCorrect'],
          properties: {
            index: { type: 'integer' },
            isCorrect: { type: 'boolean' },
          },
        },
      },
    },
  },
}

/**
 * Recomputes the score from the persisted per-answer verdicts. correctAnswers =
 * every userAnswer for the quiz with isCorrect=true (auto-gradable + open-ended);
 * totalQuestions is left as set at submit. Updates only the given attempt's
 * result row by id. Idempotent — safe to re-run.
 */
const finalizeScore = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  resultId: string,
  quizId: string,
  userId: string,
) => {
  const [{ value: correctAnswers }] = await tx
    .select({ value: count() })
    .from(userAnswers)
    .innerJoin(questions, eq(questions.id, userAnswers.questionId))
    .where(
      and(
        eq(questions.quizId, quizId),
        eq(userAnswers.userId, userId),
        eq(userAnswers.isCorrect, true),
      ),
    )

  const [current] = await tx
    .select({ totalQuestions: quizResults.totalQuestions })
    .from(quizResults)
    .where(eq(quizResults.id, resultId))

  if (!current) return

  await tx
    .update(quizResults)
    .set({
      correctAnswers,
      wrongAnswers: current.totalQuestions - correctAnswers,
      gradingStatus: 'complete',
    })
    .where(eq(quizResults.id, resultId))
}

export const gradeOpenEndedAnswers = async (
  resultId: string,
  quizId: string,
  userId: string,
): Promise<void> => {
  // Load each answered open-ended question with its model answer + rubric.
  const rows: GradeRow[] = await db
    .select({
      questionId: questions.id,
      questionText: questions.text,
      modelAnswer: questionOptions.text,
      rubric: questionOptions.explanation,
      userText: userAnswers.textAnswer,
    })
    .from(questions)
    .innerJoin(
      questionOptions,
      and(eq(questionOptions.questionId, questions.id), eq(questionOptions.isCorrect, true)),
    )
    .innerJoin(
      userAnswers,
      and(eq(userAnswers.questionId, questions.id), eq(userAnswers.userId, userId)),
    )
    .where(and(eq(questions.quizId, quizId), eq(questions.type, 'open_ended')))

  const answered = rows.filter((r) => r.userText && r.userText.trim().length > 0)

  // Nothing to grade — mark complete and stop.
  if (answered.length === 0) {
    await db
      .update(quizResults)
      .set({ gradingStatus: 'complete' })
      .where(eq(quizResults.id, resultId))
    return
  }

  try {
    const userContent = answered
      .map((r, i) =>
        [
          `Question ${i + 1}:`,
          `Q: ${r.questionText}`,
          `Model answer: ${r.modelAnswer}`,
          `Rubric: ${r.rubric ?? 'n/a'}`,
          `Student answer: ${r.userText}`,
        ].join('\n'),
      )
      .join('\n\n')

    const { data } = await chatJSON<LlmGrades>({
      model: DEFAULT_MODEL,
      schema: GRADE_SCHEMA,
      temperature: 0,
      timeoutMs: GRADING_TIMEOUT_MS,
      maxRetries: 1,
      messages: [
        { role: 'system', content: OPEN_ENDED_GRADING_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    })

    // Map verdicts back by 1-based prompt index — robust against the model not
    // echoing identifiers. A missing index defaults to incorrect.
    const verdictByIndex = new Map(data.grades.map((g) => [g.index, g.isCorrect]))

    await db.transaction(async (tx) => {
      for (let i = 0; i < answered.length; i++) {
        const isCorrect = verdictByIndex.get(i + 1) ?? false
        await tx
          .update(userAnswers)
          .set({ isCorrect })
          .where(
            and(eq(userAnswers.questionId, answered[i].questionId), eq(userAnswers.userId, userId)),
          )
      }

      await finalizeScore(tx, resultId, quizId, userId)
    })
  } catch (err) {
    logger.error('Open-ended grading failed', {
      resultId,
      error: err instanceof Error ? err.message : String(err),
    })
    // Degrade gracefully: keep totalQuestions intact so the attempt still shows
    // up in history/analytics. Open-ended verdicts stay null (UI shows them as
    // ungraded). correctAnswers stays at the auto-gradable count from submit,
    // so the percentage reflects what we could actually score.
    const [current] = await db
      .select({
        totalQuestions: quizResults.totalQuestions,
        correctAnswers: quizResults.correctAnswers,
      })
      .from(quizResults)
      .where(eq(quizResults.id, resultId))

    if (current) {
      await db
        .update(quizResults)
        .set({
          wrongAnswers: current.totalQuestions - current.correctAnswers,
          gradingStatus: 'failed',
        })
        .where(eq(quizResults.id, resultId))
    }
  }
}
