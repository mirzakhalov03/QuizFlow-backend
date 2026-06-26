import OpenAI from 'openai'

import { DEFAULT_MODEL } from '../../constants/models'
import type { QuizSource } from '../../helpers/utils/quizLambdaUtils'
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
  sources: QuizSource[]
  questionCount?: number
  type?: QuestionType
  userInstructions?: string
  defaultTitle?: string
  model?: string
  userBio?: string | null
  difficulty?: DifficultyType
  apiKey?: string
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
  avoidQuestions,
}: GenerateOptions): Promise<AiQuizResult> => {
  const count =
    questionCount && questionCount > 0 ? Math.min(questionCount, 30) : DEFAULT_QUESTION_COUNT

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

  const result = await chatJSON<AiQuiz>({
    apiKey,
    model: model ?? DEFAULT_MODEL,
    schema: buildSchema(type),
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: buildQuizSystemPrompt(type, count, userBio, difficulty, avoidQuestions),
      },
      { role: 'user', content },
    ],
  })

  return {
    quiz: result.data,
    usage: result.usage,
  }
}
