import { Readable } from 'stream'

import type { Request } from 'express'

import { AppError } from '../AppError'

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

export type MulterRequest = Request & { files?: Express.Multer.File[] }

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '-')

export const buildS3Key = (file: Express.Multer.File) => {
  const safeName = sanitizeFileName(file.originalname || 'upload')
  return `uploads/${Date.now()}-${safeName}`
}

export const getFirstUploadedFile = (req: Request) => {
  const { files } = req as MulterRequest
  const file = files?.[0]

  if (!file) {
    throw new AppError('File is required', 400, 'VALIDATION_ERROR')
  }

  return file
}

export const isReadableStream = (value: unknown): value is Readable =>
  typeof value === 'object' && value !== null && typeof (value as Readable).pipe === 'function'

export const encodeS3Key = (key: string) => key.split('/').map(encodeURIComponent).join('/')

export const buildS3ObjectUrl = (bucketName: string, region: string, key: string) =>
  `https://${bucketName}.s3.${region}.amazonaws.com/${encodeS3Key(key)}`
