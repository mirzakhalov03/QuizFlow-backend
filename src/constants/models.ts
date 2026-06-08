export const SUPPORTED_MODELS = [
  'anthropic/claude-sonnet-latest',
  'anthropic/claude-opus-latest',
  'google/gemini-flash-latest',
  'google/gemini-3.5-flash',
  'openai/gpt-latest',
  'deepseek/deepseek-v4-flash',
] as const

export type SupportedModel = (typeof SUPPORTED_MODELS)[number]

export const DEFAULT_MODEL: SupportedModel = 'anthropic/claude-sonnet-latest'
