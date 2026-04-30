export const QUESTION_TYPES = [
  'multiple_choice',
  'multi_select',
  'open_ended',
  'true_false',
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]
