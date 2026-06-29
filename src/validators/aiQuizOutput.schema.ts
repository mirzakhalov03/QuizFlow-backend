import { z } from 'zod'

import { QUESTION_TYPES } from '../types/questionTypes'
import type { QuestionType } from '../types/questionTypes'

// ---------------------------------------------------------------------------
// Primitive leaf schemas
// ---------------------------------------------------------------------------

const NonEmptyString = z.string().min(1, 'Must not be empty')

const AiOptionSchema = z.object({
  text: NonEmptyString,
  isCorrect: z.boolean(),
  explanation: NonEmptyString,
})

// ---------------------------------------------------------------------------
// Per-type question validators
// These are used inside `.superRefine` so they can produce targeted errors.
// ---------------------------------------------------------------------------

type ValidationContext = z.RefinementCtx
type AiOption = z.infer<typeof AiOptionSchema>

/**
 * Validate a multiple_choice or multi_select question's options array.
 * Path prefix should be `questions[i].options`.
 */
const refineOptions = (
  options: AiOption[],
  questionType: QuestionType,
  expectedOptionCount: number,
  ctx: ValidationContext,
  pathPrefix: (string | number)[],
) => {
  if (options.length !== expectedOptionCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix],
      message: `Expected exactly ${expectedOptionCount} options, got ${options.length}`,
    })
    // Return early — further checks on individual options are unreliable if
    // the count is wrong.
    return
  }

  const correctCount = options.filter((o) => o.isCorrect).length

  if (questionType === 'multiple_choice') {
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix],
        message: `multiple_choice must have exactly 1 correct option, got ${correctCount}`,
      })
    }
  } else if (questionType === 'multi_select') {
    if (correctCount < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...pathPrefix],
        message: `multi_select must have at least 2 correct options, got ${correctCount}`,
      })
    }
  }
}

const refineTrueFalse = (
  options: AiOption[],
  ctx: ValidationContext,
  pathPrefix: (string | number)[],
) => {
  if (options.length !== 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix],
      message: `true_false must have exactly 2 options, got ${options.length}`,
    })
    return
  }

  const texts = options.map((o) => o.text)
  const hasTrue = texts.includes('True')
  const hasFalse = texts.includes('False')

  if (!hasTrue || !hasFalse) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix],
      message: `true_false options must be exactly "True" and "False", got: ${texts.join(', ')}`,
    })
  }

  const correctCount = options.filter((o) => o.isCorrect).length
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix],
      message: `true_false must have exactly 1 correct option, got ${correctCount}`,
    })
  }
}

const refineOpenEnded = (
  options: AiOption[],
  ctx: ValidationContext,
  pathPrefix: (string | number)[],
) => {
  if (options.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix],
      message: `open_ended must have exactly 1 option (model answer), got ${options.length}`,
    })
    return
  }

  if (!options[0].isCorrect) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...pathPrefix, 0, 'isCorrect'],
      message: 'open_ended model answer must have isCorrect=true',
    })
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AiQuizOutputSchemaOptions = {
  /** The requested question type. `undefined` is treated the same as `"mixed"`. */
  type?: QuestionType
  /** How many questions were requested. */
  questionCount: number
  /** How many options were requested per multiple_choice/multi_select question. */
  optionsPerQuestion: number
}

/**
 * Builds a Zod schema that validates the AI model's raw quiz output against
 * the generation parameters that were included in the system prompt.
 *
 * Call `schema.safeParse(aiOutput)` and check `success` / `error.issues`.
 */
export const buildAiQuizOutputSchema = ({
  type,
  questionCount,
  optionsPerQuestion,
}: AiQuizOutputSchemaOptions) => {
  // Determine which question types are valid for this generation run.
  const validTypes = QUESTION_TYPES.filter((t) => t !== 'mixed') as [string, ...string[]]
  const isMixed = !type || type === 'mixed'

  return z
    .object({
      title: NonEmptyString,
      questions: z
        .array(
          z
            .object({
              text: NonEmptyString,
              type: z.enum(validTypes),
              options: z.array(AiOptionSchema).min(1),
            })
            .superRefine((question, ctx) => {
              const qType = question.type as QuestionType
              const optionsPath = ['options']

              switch (qType) {
                case 'multiple_choice':
                case 'multi_select':
                  refineOptions(question.options, qType, optionsPerQuestion, ctx, optionsPath)
                  break
                case 'true_false':
                  refineTrueFalse(question.options, ctx, optionsPath)
                  break
                case 'open_ended':
                  refineOpenEnded(question.options, ctx, optionsPath)
                  break
              }
            }),
        )
        .length(questionCount, `Expected exactly ${questionCount} questions, got {actual}`),
    })
    .superRefine((quiz, ctx) => {
      // Enforce the per-question type constraint.
      if (!isMixed) {
        quiz.questions.forEach((question, index) => {
          if (question.type !== type) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['questions', index, 'type'],
              message: `Expected question type "${type}", got "${question.type}"`,
            })
          }
        })
      }
    })
}

export type AiQuizOutputSchema = ReturnType<typeof buildAiQuizOutputSchema>
export type ValidatedAiQuiz = z.infer<AiQuizOutputSchema>
