import { z } from 'zod'

import { SUPPORTED_MODELS } from '../constants/models'
import { QUESTION_TYPES } from '../types/questionTypes'

const QuestionTypeEnum = z.enum(QUESTION_TYPES)

export const GenerateQuizSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
    // Must have either s3Url, key, or keys
    if (!data.s3Url && !data.key && (!data.keys || data.keys.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['key'],
        message: 'Either s3Url, key, or keys is required',
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

export const GetQuizzesSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must be at most 100')
    .default(20),
  offset: z.coerce.number().int().min(0, 'offset must be a non-negative integer').default(0),
  search: z.string().trim().min(1).optional(),
})

export type GetQuizzesQuery = z.infer<typeof GetQuizzesSchema>

export const GenerateQuizFromNotionSchema = z
  .object({
    pageId: z.string().min(1, 'pageId is required'),

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
          textAnswer: z.string().max(5000).optional(),
        })
        .superRefine((data, ctx) => {
          if (!data.selectedOptionId && !data.textAnswer) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [],
              message: 'Either selectedOptionId or textAnswer is required',
            })
          }
        }),
    )
    .min(1, 'At least one answer is required')
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
