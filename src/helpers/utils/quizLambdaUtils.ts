import type { Readable } from 'stream'

import type { QuestionType } from '../../types/questionTypes'

export const streamToString = async (stream: Readable) => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

export const normalizeQuestionType = (value: string | undefined): QuestionType => {
  const normalized = (value ?? 'open_ended').trim().toLowerCase().replace(/\s+/g, '_')
  if (normalized === 'multiple_choice' || normalized === 'multi_select') return normalized
  if (normalized === 'true_false' || normalized === 'true/false') return 'true_false'
  return 'open_ended'
}

export const normalizeCorrectList = (value: string | string[] | undefined) => {
  if (!value) return []
  return Array.isArray(value) ? value.map((item) => item.trim()) : [value.trim()]
}
