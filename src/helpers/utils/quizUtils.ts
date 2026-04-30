import { AppError } from '../AppError'

export const parseS3Url = (url: string) => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new AppError('Invalid s3Url format', 400, 'VALIDATION_ERROR')
  }

  const hostParts = parsed.hostname.split('.')
  const bucket = hostParts[0]
  const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))

  if (!bucket || !key) {
    throw new AppError('s3Url must include bucket and key', 400, 'VALIDATION_ERROR')
  }

  return { bucket, key }
}
