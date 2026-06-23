export const SUPPORTED_MODELS = [
  'google/gemini-3.5-flash',
  'google/gemini-2.5-flash',

  'openai/gpt-4.1-mini',
  'openai/gpt-4o',

  'meta-llama/llama-4-maverick',
  'meta-llama/llama-3.3-70b-instruct',

  'anthropic/claude-3-haiku',

  'deepseek/deepseek-r1',
  'deepseek/deepseek-chat-v3',

  'mistralai/mistral-small-2603',
] as const

export type SupportedModel = (typeof SUPPORTED_MODELS)[number]

export const DEFAULT_MODEL: SupportedModel = 'google/gemini-3.5-flash'
