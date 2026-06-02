import OpenAI from 'openai'

import { chatJSON } from './openRouter'
import { DEFAULT_MODEL } from '../constants/models'
import { QUESTION_TYPES } from '../types/questionTypes'
import type { QuestionType } from '../types/questionTypes'

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

const buildSystemPrompt = (
  type: QuestionType | undefined,
  count: number,
  userBio?: string | null,
) => {
  const typeRule = type
    ? `Every question MUST be of type "${type}".`
    : `Pick the most appropriate type per question from: ${QUESTION_TYPES.join(', ')}. Vary the types across the quiz — do not use the same type for every question.`

  return [
    'You are an expert quiz designer. Your goal is to produce questions that genuinely test whether a student understood the source material — not just whether they memorised isolated facts.',
    '',
    '## Output rules',
    `- Generate exactly ${count} questions.`,
    typeRule,
    '',
    '## Question type constraints',
    '- "multiple_choice": 4 options, exactly one isCorrect=true.',
    '- "multi_select": 4–5 options, two or more isCorrect=true.',
    '- "true_false": exactly two options with the text "True" and "False", exactly one isCorrect=true.',
    '- "open_ended": exactly one option whose text is a concise model answer (2–4 sentences). isCorrect=true. The explanation should describe what key points a complete answer must cover.',
    '',
    '## Question quality',
    `- Distribute questions evenly across the full source material. If the text has ${count} distinct sections or ideas, draw one question from each. Never cluster more than two questions around the same passage.`,
    '- Vary cognitive depth. At least one question per five must go beyond recall — ask why something happens, what the consequence of a decision is, or how two concepts relate.',
    '- Write question stems as complete, unambiguous sentences. Avoid double negatives and "which of the following is NOT" phrasing unless the concept genuinely requires it.',
    '- No two questions may test the same fact or concept, even if worded differently.',
    '',
    '## Distractor quality (multiple_choice and multi_select)',
    '- Wrong options must be plausible to a student who partially understood the material — a common misconception, a related-but-incorrect term, or a value that is close but wrong.',
    '- Never use "all of the above", "none of the above", or obviously absurd options.',
    '- Correct and incorrect options should be similar in length and grammatical form.',
    '',
    '## Explanations',
    '- Every option must have an explanation field.',
    '- For correct options: one sentence explaining why it is right, citing the relevant part of the source.',
    '- For incorrect options: one sentence explaining the misconception or why it is wrong.',
    '',
    '## Grounding',
    '- Every question and every answer must be directly supported by the source material.',
    '- Do not introduce facts, definitions, or claims that are not present in the source.',
    ...(userBio
      ? [
          '',
          '## User profile context',
          '- The following is the profile bio of the user requesting the quiz. Use this to tailor the terminology, complexity to their background: ' +
            userBio,
        ]
      : []),
  ].join('\n')
}

export const generateQuizFromText = async ({
  sourceText,
  questionCount,
  type,
  userInstructions,
  defaultTitle,
  model,
  userBio,
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
    model: model ?? DEFAULT_MODEL,
    schema: buildSchema(type),
    temperature: 0.3,
    messages: [
      { role: 'system', content: buildSystemPrompt(type, count, userBio) },
      { role: 'user', content: userParts.join('\n\n') },
    ],
  })

  return {
    quiz: result.data,
    usage: result.usage,
  }
}
