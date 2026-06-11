import { and, count, eq } from 'drizzle-orm'

import { chatJSON } from './clients/openrouter.client'
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
 * totalQuestions is left as set at submit. Idempotent — safe to re-run.
 */
const finalizeScore = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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
    .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))

  if (!current) return

  await tx
    .update(quizResults)
    .set({
      correctAnswers,
      wrongAnswers: current.totalQuestions - correctAnswers,
      gradingStatus: 'complete',
    })
    .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))
}

export const gradeOpenEndedAnswers = async (quizId: string, userId: string): Promise<void> => {
  // Count auto-gradable questions so we can shrink the denominator on failure.
  const allQuestions = await db
    .select({ id: questions.id, type: questions.type })
    .from(questions)
    .where(eq(questions.quizId, quizId))
  const autoGradableCount = allQuestions.filter((q) => q.type !== 'open_ended').length

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
      .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))
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

      await finalizeScore(tx, quizId, userId)
    })
  } catch (err) {
    console.error('[openEndedGrading] failed:', err)
    // Degrade gracefully: drop open-ended from the denominator and leave their
    // verdicts null (the UI shows them as ungraded). correctAnswers keeps the
    // auto-gradable count already persisted at submit.
    const [current] = await db
      .select({ correctAnswers: quizResults.correctAnswers })
      .from(quizResults)
      .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))

    if (current) {
      await db
        .update(quizResults)
        .set({
          totalQuestions: autoGradableCount,
          wrongAnswers: autoGradableCount - current.correctAnswers,
          gradingStatus: 'failed',
        })
        .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))
    }
  }
}
