import type { Readable } from 'stream'

import mammoth from 'mammoth'

import type { QuestionType } from '../../types/questionTypes'

/** Maximum file size allowed to be read from S3 for quiz generation (25 MB) */
export const QUIZ_FILE_MAX_BYTES = 25 * 1024 * 1024

export type QuizSource =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; buffer: Buffer; filename: string }

export const streamToBuffer = async (stream: Readable, maxBytes?: number): Promise<Buffer> => {
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
  return Buffer.concat(chunks)
}

const extractDocxText = async (buffer: Buffer): Promise<string> => {
  const { value } = await mammoth.extractRawText({ buffer })
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('DOCX appears to be empty — no text could be extracted')
  }

  return trimmed
}

const extractPptxText = (buffer: Buffer): string => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AdmZip = require('adm-zip') as new (buf: Buffer) => {
    getEntries(): Array<{ entryName: string; getData(): Buffer }>
  }

  const zip = new AdmZip(buffer)
  const slideFiles = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }))

  const text = slideFiles
    .map((entry) => {
      const xml = entry.getData().toString('utf-8')
      return (xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [])
        .map((m) => m.replace(/<[^>]+>/g, ''))
        .join(' ')
    })
    .join('\n\n')
    .trim()

  if (!text) throw new Error('PPTX appears to be empty — no text could be extracted')
  return text
}

export const extractSourceFromBuffer = async (
  buffer: Buffer,
  contentType: string,
  key: string,
): Promise<QuizSource> => {
  const lowerKey = key.toLowerCase()
  const isPdf = contentType === 'application/pdf' || lowerKey.endsWith('.pdf')
  const isDocx = contentType.includes('wordprocessingml') || lowerKey.endsWith('.docx')
  const isPptx = contentType.includes('presentationml') || lowerKey.endsWith('.pptx')

  if (isPdf) {
    const filename = key.split('/').pop() || 'document.pdf'
    return { kind: 'pdf', buffer, filename }
  }
  if (isDocx) return { kind: 'text', text: await extractDocxText(buffer) }
  if (isPptx) return { kind: 'text', text: extractPptxText(buffer) }

  return { kind: 'text', text: buffer.toString('utf-8') }
}

export const normalizeQuestionType = (value: string | undefined): QuestionType => {
  const normalized = (value ?? 'open_ended').trim().toLowerCase().replace(/\s+/g, '_')
  if (normalized === 'multiple_choice' || normalized === 'multi_select') return normalized
  if (normalized === 'true_false' || normalized === 'true/false') return 'true_false'
  if (normalized === 'mixed') return 'mixed'
  return 'open_ended'
}
