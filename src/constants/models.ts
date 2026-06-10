export const SUPPORTED_MODELS = [
  'google/gemini-3.5-flash',
  'openai/gpt-4o-mini',
  'deepseek/deepseek-chat-v3',
  'meta-llama/llama-3.3-70b-instruct',
] as const

export type SupportedModel = (typeof SUPPORTED_MODELS)[number]

export const DEFAULT_MODEL: SupportedModel = 'google/gemini-3.5-flash'
