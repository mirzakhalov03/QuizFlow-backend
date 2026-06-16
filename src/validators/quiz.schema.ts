import { z } from 'zod'

import { SUPPORTED_MODELS } from '../constants/models'
import { DIFFICULTY_TYPES } from '../types/difficultyTypes'
import { QUESTION_TYPES } from '../types/questionTypes'

const QuestionTypeEnum = z.enum(QUESTION_TYPES)
const DifficultyTypeEnum = z.enum(DIFFICULTY_TYPES)
export const GenerateQuizSourceSchema = z.object({
  source: z.enum(['file', 'notion']).default('file'),
})

export const GenerateQuizSchema = z
  .object({
    /** Notion page IDs — required when source=notion, supports multiple pages */
    pageIds: z
      .union([z.array(z.string().min(1)).min(1).max(50), z.string().min(1)])
      .transform((val) => (Array.isArray(val) ? val : [val]))
      .optional(),

    /** Full S3 URL (s3://bucket/key) or standard AWS HTTPS URL. Takes precedence over `bucket`+`key`. */
    s3Url: z
      .string()
      .regex(/^(s3|https?):\/\/.+/, { message: 'Must be a valid S3 or HTTP(S) URL' })
      .optional(),

    /** S3 bucket name. Required when `s3Url` is not provided. */
    bucket: z.string().min(1, 'bucket must not be empty').optional(),

    /** S3 object key. Required when `s3Url` and `keys` are not provided. */
    key: z.string().min(1, 'key must not be empty').optional(),

    /** Multiple S3 object keys. Takes precedence over `key` when provided. */
    keys: z.array(z.string().min(1)).min(1).optional(),

    /** Human-readable quiz title (max 200 chars). */
    title: z.string().min(1).max(200).optional(),

    /** Additional generation instructions for the AI. */
    userInstructions: z.string().max(1000).optional(),

    /** Whether a per-question countdown timer should be enabled. */
    isTimerEnabled: z.boolean().optional(),

    /** Duration in seconds per question. Must be a positive integer when supplied. */
    timerDuration: z.coerce
      .number()
      .int()
      .positive('timerDuration must be a positive integer')
      .optional(),

    /** Question format for the generated quiz. */
    type: QuestionTypeEnum.optional(),

    questionCount: z.coerce.number().int().min(1).max(30).optional(),

    /** AI model to use for quiz generation. */
    model: z.enum(SUPPORTED_MODELS as unknown as [string, ...string[]]).optional(),

    folderId: z.string().uuid().optional(),
    difficulty: DifficultyTypeEnum.optional(),

    apiKeyId: z.uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const hasFileSource = data.s3Url || data.key || (data.keys && data.keys.length > 0)
    const hasNotionSource = data.pageIds && data.pageIds.length > 0

    if (!hasFileSource && !hasNotionSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pageIds'],
        message: 'Either pageIds (for notion) or s3Url/key/keys (for file) is required',
      })
    }

    if (data.isTimerEnabled && !data.timerDuration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timerDuration'],
        message: 'timerDuration is required when isTimerEnabled is true',
      })
    }
  })

export type GenerateQuizInput = z.infer<typeof GenerateQuizSchema>

export const PatchQuizSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    userInstructions: z.string().max(1000).nullable().optional(),
    isTimerEnabled: z.boolean().optional(),
    timerDuration: z.coerce.number().int().positive().nullable().optional(),
    type: QuestionTypeEnum.optional(),
  })
  .superRefine((data, ctx) => {
    const hasAnyField = Object.values(data).some((v) => v !== undefined)
    if (!hasAnyField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'At least one updatable field is required',
      })
    }

    if (
      data.isTimerEnabled === true &&
      (data.timerDuration === undefined || data.timerDuration === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timerDuration'],
        message: 'timerDuration is required when isTimerEnabled is true',
      })
    }
  })

export type PatchQuizInput = z.infer<typeof PatchQuizSchema>

/**
 * Filter by one or more question types. Accepts a repeated `types` param
 * (`?types=open_ended&types=true_false`) or a comma-separated list
 * (`?types=open_ended,true_false`). Normalised to a deduped array.
 */
const QuestionTypesFilter = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined
  const raw = Array.isArray(val) ? val.flatMap((v) => String(v).split(',')) : String(val).split(',')
  const cleaned = new Set<string>()
  for (const v of raw) {
    const trimmed = v.trim()
    if (trimmed) cleaned.add(trimmed)
  }
  return cleaned.size > 0 ? [...cleaned] : undefined
}, z.array(QuestionTypeEnum).max(QUESTION_TYPES.length).optional())

export const GetQuizzesSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(1000, 'limit must be at most 1000')
    .default(20),
  offset: z.coerce.number().int().min(0, 'offset must be a non-negative integer').default(0),
  search: z.string().trim().min(1).optional(),
  /** Filter quizzes by question type. */
  types: QuestionTypesFilter,
  /** Sort by creation date: newest first (default) or oldest first. */
  sort: z.enum(['newest', 'oldest']).default('newest'),
  /** Exclude quizzes that are in a specific folder */
  excludeFolderId: z.string().uuid().optional(),
})

export type GetQuizzesQuery = z.infer<typeof GetQuizzesSchema>

export const GenerateQuizFromNotionSchema = z
  .object({
    userId: z.uuid(),
    pageIds: z
      .union([z.array(z.string().min(1)).min(1).max(50), z.string().min(1)])
      .transform((val) => (Array.isArray(val) ? val : [val])),

    title: z.string().min(1).max(200).optional(),

    userInstructions: z.string().max(1000).optional(),

    isTimerEnabled: z.boolean().optional(),

    timerDuration: z.coerce
      .number()
      .int()
      .positive('timerDuration must be a positive integer')
      .optional(),

    type: QuestionTypeEnum.optional(),

    questionCount: z.coerce.number().int().min(1).max(30).optional(),

    folderId: z.uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isTimerEnabled && !data.timerDuration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timerDuration'],
        message: 'timerDuration is required when isTimerEnabled is true',
      })
    }
  })

export type GenerateQuizFromNotionInput = z.infer<typeof GenerateQuizFromNotionSchema>

export const SubmitQuizSchema = z.object({
  answers: z
    .array(
      z
        .object({
          questionId: z.string().uuid(),
          selectedOptionId: z.string().uuid().optional(),
          selectedOptionIds: z.array(z.string().uuid()).min(1).max(20).optional(),
          textAnswer: z.string().max(5000).optional(),
        })
        .superRefine((data, ctx) => {
          const provided =
            (data.selectedOptionId ? 1 : 0) +
            (data.selectedOptionIds && data.selectedOptionIds.length > 0 ? 1 : 0) +
            (data.textAnswer && data.textAnswer.trim().length > 0 ? 1 : 0)

          if (provided !== 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [],
              message: 'Provide exactly one of selectedOptionId, selectedOptionIds, or textAnswer',
            })
          }

          if (
            data.selectedOptionIds &&
            new Set(data.selectedOptionIds).size !== data.selectedOptionIds.length
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['selectedOptionIds'],
              message: 'selectedOptionIds must not contain duplicates',
            })
          }
        }),
    )
    .max(100, 'Too many answers submitted')
    .superRefine((answers, ctx) => {
      const seen = new Set<string>()

      answers.forEach((answer, index) => {
        if (seen.has(answer.questionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate questionId: ${answer.questionId}`,
            path: [index, 'questionId'],
          })
        }
        seen.add(answer.questionId)
      })
    }),
})

export type SubmitQuizInput = z.infer<typeof SubmitQuizSchema>
