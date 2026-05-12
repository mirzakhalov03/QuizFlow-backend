import { chatJSON } from './openRouter'
import { QUESTION_TYPES } from '../types/questionTypes'
import type { QuestionType } from '../types/questionTypes'

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.0-flash-001'
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

type GenerateOptions = {
  sourceText: string
  questionCount?: number
  type?: QuestionType
  userInstructions?: string
  defaultTitle?: string
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

const buildSystemPrompt = (type: QuestionType | undefined, count: number) => {
  const typeRule = type
    ? `Every question MUST be of type "${type}".`
    : `Pick the most appropriate type per question from: ${QUESTION_TYPES.join(', ')}.`

  return [
    'You are a quiz generator that produces high-quality questions strictly grounded in the source material the user provides.',
    'Rules:',
    `- Generate exactly ${count} questions.`,
    typeRule,
    '- For "open_ended" questions, return a single option whose text is the model answer, isCorrect=true, with an explanation that summarizes what a correct response should contain.',
    '- For "true_false" questions, return exactly two options ("True" and "False"), with exactly one marked isCorrect=true.',
    '- For "multiple_choice", return 4 options with exactly one isCorrect=true.',
    '- For "multi_select", return 4-5 options with two or more isCorrect=true.',
    '- Every option MUST include a one-sentence explanation of why it is correct or incorrect, grounded in the source material.',
    '- Do not invent facts that are not supported by the source material.',
    '- Return ONLY JSON conforming to the provided schema. No prose, no markdown.',
  ].join('\n')
}

export const generateQuizFromText = async ({
  sourceText,
  questionCount,
  type,
  userInstructions,
  defaultTitle,
}: GenerateOptions): Promise<AiQuiz> => {
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

  return chatJSON<AiQuiz>({
    model: DEFAULT_MODEL,
    schema: buildSchema(type),
    temperature: 0.3,
    messages: [
      { role: 'system', content: buildSystemPrompt(type, count) },
      { role: 'user', content: userParts.join('\n\n') },
    ],
  })
}
