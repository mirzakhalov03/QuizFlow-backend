import type { DifficultyType } from '../types/difficultyTypes'
import { QUESTION_TYPES } from '../types/questionTypes'
import type { QuestionType } from '../types/questionTypes'

const defineDifficultyRule = (difficulty: DifficultyType) => {
  switch (difficulty) {
    case 'easy':
      return '- Difficulty: Easy. Focus on basic recall and definitions.'
    case 'medium':
      return '- Difficulty: Medium. Focus on comprehension and application of concepts.'
    case 'hard':
      return '- Difficulty: Hard. Focus on deep analysis and synthesis of information.'
    default:
      return '- Difficulty: Not defined'
  }
}

export const buildQuizSystemPrompt = (
  type: QuestionType | undefined,
  count: number,
  userBio?: string | null,
  difficulty?: DifficultyType,
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
    ...(difficulty ? ['', '## Difficulty', defineDifficultyRule(difficulty)] : []),
  ].join('\n')
}
