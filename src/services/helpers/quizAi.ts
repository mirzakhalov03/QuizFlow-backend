import OpenAI from 'openai'
import type { ZodIssue } from 'zod'

import { logger } from '../../config/logger'
import { DEFAULT_MODEL } from '../../constants/models'
import { AppError } from '../../helpers/AppError'
import type { QuizSource } from '../../helpers/utils/quizLambdaUtils'
import { buildQuizSystemPrompt } from '../../prompts'
import type { DifficultyType } from '../../types/difficultyTypes'
import { QUESTION_TYPES } from '../../types/questionTypes'
import type { QuestionType } from '../../types/questionTypes'
import { buildAiQuizOutputSchema } from '../../validators/aiQuizOutput.schema'
import { chatJSON } from '../clients/openrouter.client'
import type { ChatMessage } from '../clients/openrouter.client'

const SOURCE_TEXT_LIMIT = 50_000
const DEFAULT_QUESTION_COUNT = 5
const MAX_RETRIES = 2

export type AiQuestionOption = {
  text: string
  isCorrect: boolean
  explanation: string
}

export type AiQuestion = {
  text: string
  type: QuestionType
  options: AiQuestionOption[]
}

export type AiQuiz = {
  title: string
  questions: AiQuestion[]
}

export type AiQuizResult = {
  quiz: AiQuiz
  usage?: OpenAI.CompletionUsage
}

type GenerateOptions = {
  sources: QuizSource[]
  questionCount?: number
  type: QuestionType
  userInstructions?: string
  defaultTitle?: string
  model?: string
  userBio?: string | null
  difficulty?: DifficultyType
  apiKey?: string
  optionsPerQuestion?: number
  avoidQuestions?: string[]
}

const buildSchema = (type?: QuestionType) => ({
  name: 'quiz',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'questions'],
    properties: {
      title: { type: 'string' },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'type', 'options'],
          properties: {
            text: { type: 'string' },
            type:
              type && type !== 'mixed'
                ? { type: 'string', enum: [type] }
                : {
                    type: 'string',
                    enum: QUESTION_TYPES.filter((t) => t !== 'mixed'),
                  },
            options: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'isCorrect', 'explanation'],
                properties: {
                  text: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                  explanation: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
})

/**
 * Formats Zod validation issues into a concise correction prompt that is
 * appended to the conversation so the model can fix its output.
 */
const buildCorrectionMessage = (issues: ZodIssue[]): string => {
  const lines = issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `- ${path}: ${issue.message}`
  })

  return [
    'Your previous response violated the quiz generation rules.',
    'Fix ONLY the following issues and return a complete, corrected quiz JSON:',
    '',
    ...lines,
    '',
    'Re-read the original instructions and return the full corrected quiz JSON.',
  ].join('\n')
}

export const generateQuizFromText = async ({
  sources,
  questionCount,
  type,
  userInstructions,
  defaultTitle,
  model,
  userBio,
  difficulty,
  apiKey,
  optionsPerQuestion,
  avoidQuestions,
}: GenerateOptions): Promise<AiQuizResult> => {
  const count =
    questionCount && questionCount > 0 ? Math.min(questionCount, 30) : DEFAULT_QUESTION_COUNT
  const optionCount = optionsPerQuestion ?? 4

  const textParts = sources.filter(
    (s): s is Extract<QuizSource, { kind: 'text' }> => s.kind === 'text',
  )
  const pdfParts = sources.filter(
    (s): s is Extract<QuizSource, { kind: 'pdf' }> => s.kind === 'pdf',
  )

  const joinedText = textParts.map((s) => s.text).join('\n\n---\n\n')
  const truncated = joinedText.slice(0, SOURCE_TEXT_LIMIT)
  const wasTruncated = joinedText.length > SOURCE_TEXT_LIMIT

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = []

  for (const pdf of pdfParts) {
    content.push({
      type: 'file',
      file: {
        filename: pdf.filename,
        file_data: `data:application/pdf;base64,${pdf.buffer.toString('base64')}`,
      },
    })
  }

  const textParagraphs: string[] = []
  if (truncated) {
    textParagraphs.push(
      `Source material${wasTruncated ? ' (truncated)' : ''}:\n"""\n${truncated}\n"""`,
    )
  } else if (pdfParts.length > 0) {
    textParagraphs.push('Source material is the attached PDF document(s).')
  }
  if (userInstructions) {
    textParagraphs.push(`Additional instructions from the user:\n${userInstructions}`)
  }
  if (defaultTitle) {
    textParagraphs.push(`Suggested title (you may improve it): ${defaultTitle}`)
  }

  content.push({ type: 'text', text: textParagraphs.join('\n\n') })

  const systemPrompt = buildQuizSystemPrompt(
    type,
    count,
    userBio,
    difficulty,
    optionCount,
    avoidQuestions,
  )

  // Base conversation — reused across all attempts. The retry loop appends
  // the model's bad response and a correction request before each re-call.
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content },
    {
      role: 'system',
      content: buildQuizSystemPrompt(type, count, userBio, difficulty, optionCount),
    },
  ]

  const validationSchema = buildAiQuizOutputSchema({
    type,
    questionCount: count,
    optionsPerQuestion: optionCount,
  })

  let conversationMessages: ChatMessage[] = [...baseMessages]
  let lastError: ZodIssue[] = []
  let lastUsage: OpenAI.CompletionUsage | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const result = await chatJSON<AiQuiz>({
      apiKey,
      model: model ?? DEFAULT_MODEL,
      schema: buildSchema(type),
      temperature: 0.3,
      messages: conversationMessages,
    })

    lastUsage = result.usage

    const parsed = validationSchema.safeParse(result.data)

    if (parsed.success) {
      logger.debug('[quizAi] Quiz output passed validation', {
        attempt,
        questionCount: parsed.data.questions.length,
      })
      return {
        quiz: parsed.data as AiQuiz,
        usage: lastUsage,
      }
    }

    lastError = parsed.error.issues
    logger.warn('[quizAi] Quiz output failed validation', {
      attempt,
      maxAttempts: MAX_RETRIES + 1,
      issueCount: lastError.length,
      issues: lastError.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })

    if (attempt <= MAX_RETRIES) {
      // Append the model's bad response and a correction prompt to the
      // conversation so the next call has full context.
      const rawAssistantContent =
        typeof result.data === 'string' ? result.data : JSON.stringify(result.data)

      conversationMessages = [
        ...conversationMessages,
        { role: 'assistant', content: rawAssistantContent },
        { role: 'user', content: buildCorrectionMessage(lastError) },
      ]
    }
  }

  // All attempts exhausted — surface the last set of validation errors.
  const summary = lastError.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  throw new AppError(
    `AI model did not adhere to quiz generation parameters after ${MAX_RETRIES + 1} attempts: ${summary}`,
    502,
    'AI_OUTPUT_INVALID',
    { issues: lastError },
  )
}
