export const DIFFICULTY_TYPES = ['easy', 'medium', 'hard'] as const
export type DifficultyType = (typeof DIFFICULTY_TYPES)[number]
