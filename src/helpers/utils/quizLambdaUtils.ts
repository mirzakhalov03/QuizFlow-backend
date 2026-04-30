import type { Readable } from 'stream'

import type { QuestionType } from '../../types/questionTypes'

export const QUIZ_FILE_MAX_BYTES = 25 * 1024 * 1024

export const streamToString = async (stream: Readable, maxBytes?: number) => {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    totalBytes += buffer.length
    if (maxBytes !== undefined && totalBytes > maxBytes) {
      throw new Error('S3 object exceeds allowed size limit')
    }
    chunks.push(buffer)
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
