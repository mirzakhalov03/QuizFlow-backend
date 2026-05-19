import type { Readable } from 'stream'

import type { QuestionType } from '../../types/questionTypes'

/** Maximum file size allowed to be read from S3 for quiz generation (25 MB) */
export const QUIZ_FILE_MAX_BYTES = 25 * 1024 * 1024

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

const PDF_PARSE_TIMEOUT_MS = 45_000

const extractPdfText = (buffer: Buffer): Promise<string> => {
  // pdf2json is CJS and callback-based — pass verbosity=0 to suppress link/form warnings
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFParser = require('pdf2json') as new (
    context?: null,
    verbosity?: number,
  ) => {
    on(
      event: 'pdfParser_dataReady',
      cb: (data: { Pages: Array<{ Texts: Array<{ R: Array<{ T: string }> }> }> }) => void,
    ): void
    on(event: 'pdfParser_dataError', cb: (err: { parserError: Error }) => void): void
    parseBuffer(buf: Buffer): void
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`PDF parsing exceeded ${PDF_PARSE_TIMEOUT_MS / 1000}s`)),
      PDF_PARSE_TIMEOUT_MS,
    )

    // verbosity=0 suppresses the per-link "Unsupported: field.type of Link" console noise
    const parser = new PDFParser(null, 0)

    parser.on('pdfParser_dataError', ({ parserError }) => {
      clearTimeout(timer)
      reject(parserError)
    })

    parser.on('pdfParser_dataReady', (data) => {
      clearTimeout(timer)
      const safeDecode = (s: string) => {
        try {
          return decodeURIComponent(s)
        } catch {
          return s
        }
      }
      const text = data.Pages.map((page) => {
        const blocks = page.Texts.map((t) => t.R.map((r) => safeDecode(r.T)).join(''))
        return blocks.join('\n')
      }).join('\n\n')

      const trimmed = text.trim()
      if (!trimmed) {
        reject(
          new Error('PDF appears to be empty or contains only images — no text could be extracted'),
        )
      } else {
        resolve(trimmed)
      }
    })

    parser.parseBuffer(buffer)
  })
}

export const extractTextFromBuffer = async (
  buffer: Buffer,
  contentType: string,
  key: string,
): Promise<string> => {
  const isPdf = contentType === 'application/pdf' || key.toLowerCase().endsWith('.pdf')

  if (isPdf) {
    return extractPdfText(buffer)
  }

  return buffer.toString('utf-8')
}

/** @deprecated Use streamToBuffer + extractTextFromBuffer instead */
export const streamToString = async (stream: Readable, maxBytes?: number) => {
  const buffer = await streamToBuffer(stream, maxBytes)
  return buffer.toString('utf-8')
}

export const normalizeQuestionType = (value: string | undefined): QuestionType => {
  const normalized = (value ?? 'open_ended').trim().toLowerCase().replace(/\s+/g, '_')
  if (normalized === 'multiple_choice' || normalized === 'multi_select') return normalized
  if (normalized === 'true_false' || normalized === 'true/false') return 'true_false'
  return 'open_ended'
}
