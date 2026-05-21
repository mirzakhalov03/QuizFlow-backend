import { randomUUID } from 'crypto'
import { Readable } from 'stream'

import type { Request } from 'express'

import { AppError } from '../AppError'

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
]

export type MulterRequest = Request & { file?: Express.Multer.File; files?: Express.Multer.File[] }

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '-')

export const buildS3Key = (file: Express.Multer.File) => {
  const safeName = sanitizeFileName(file.originalname || 'upload')
  return `uploads/${randomUUID()}-${safeName}`
}

export const getUploadedFiles = (req: Request) => {
  const { files } = req as MulterRequest

  if (!files || files.length === 0) {
    throw new AppError('At least one file is required', 400, 'VALIDATION_ERROR')
  }

  return files
}

export const isReadableStream = (value: unknown): value is Readable =>
  typeof value === 'object' && value !== null && typeof (value as Readable).pipe === 'function'

export const encodeS3Key = (key: string) => key.split('/').map(encodeURIComponent).join('/')

export const buildS3ObjectUrl = (bucketName: string, region: string, key: string) =>
  `https://${bucketName}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`
