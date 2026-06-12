import OpenAI from 'openai'

import { DEFAULT_MODEL } from '../../constants/models'
import { buildQuizSystemPrompt } from '../../prompts'
import type { DifficultyType } from '../../types/difficultyTypes'
import { QUESTION_TYPES } from '../../types/questionTypes'
import type { QuestionType } from '../../types/questionTypes'
import { chatJSON } from '../clients/openrouter.client'

const SOURCE_TEXT_LIMIT = 50_000
const DEFAULT_QUESTION_COUNT = 5

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
  sourceText: string
  questionCount?: number
  type?: QuestionType
  userInstructions?: string
  defaultTitle?: string
  model?: string
  userBio?: string | null
  difficulty?: DifficultyType
  apiKey?: string
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
            type: type
              ? { type: 'string', enum: [type] }
              : { type: 'string', enum: [...QUESTION_TYPES] },
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

export const generateQuizFromText = async ({
  sourceText,
  questionCount,
  type,
  userInstructions,
  defaultTitle,
  model,
  userBio,
  difficulty,
  apiKey,
}: GenerateOptions): Promise<AiQuizResult> => {
  const count =
    questionCount && questionCount > 0 ? Math.min(questionCount, 30) : DEFAULT_QUESTION_COUNT

  const truncated = sourceText.slice(0, SOURCE_TEXT_LIMIT)
  const wasTruncated = sourceText.length > SOURCE_TEXT_LIMIT

  const userParts = [
    `Source material${wasTruncated ? ' (truncated)' : ''}:\n"""\n${truncated}\n"""`,
  ]

  if (userInstructions) {
    userParts.push(`Additional instructions from the user:\n${userInstructions}`)
  }

  if (defaultTitle) {
    userParts.push(`Suggested title (you may improve it): ${defaultTitle}`)
  }

  const result = await chatJSON<AiQuiz>({
    apiKey,
    model: model ?? DEFAULT_MODEL,
    schema: buildSchema(type),
    temperature: 0.3,
    messages: [
      { role: 'system', content: buildQuizSystemPrompt(type, count, userBio, difficulty) },
      { role: 'user', content: userParts.join('\n\n') },
    ],
  })

  return {
    quiz: result.data,
    usage: result.usage,
  }
}
