import { AppError } from '../AppError'

/**
 * Parses an S3 object URL into { bucket, key }.
 *
 * Supports:
 *  - Virtual-hosted:  https://<bucket>.s3.<region>.amazonaws.com/<key>
 *  - Path-style:      https://s3.<region>.amazonaws.com/<bucket>/<key>
 *  - Accelerated:     https://<bucket>.s3-accelerate.amazonaws.com/<key>
 */
export const parseS3Url = (url: string): { bucket: string; key: string } => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new AppError('Invalid s3Url format', 400, 'VALIDATION_ERROR')
  }

  const hostname = parsed.hostname

  // Path-style: s3.amazonaws.com/<bucket>/... or s3.<region>.amazonaws.com/<bucket>/...
  if (hostname === 's3.amazonaws.com' || /^s3\.[a-z0-9-]+\.amazonaws\.com$/.test(hostname)) {
    const pathParts = parsed.pathname.replace(/^\/+/, '').split('/')
    const bucket = pathParts[0]
    const key = decodeURIComponent(pathParts.slice(1).join('/'))

    if (!bucket || !key) {
      throw new AppError('s3Url must include bucket and key', 400, 'VALIDATION_ERROR')
    }

    return { bucket, key }
  }

  // Virtual-hosted: <bucket>.s3.amazonaws.com, <bucket>.s3.<region>.amazonaws.com,
  // or <bucket>.s3-accelerate.amazonaws.com
  const virtualMatch = hostname.match(/^([^.]+)\.s3(?:[.-][^.]+)*\.amazonaws\.com$/)
  if (virtualMatch) {
    const bucket = virtualMatch[1]
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))

    if (!bucket || !key) {
      throw new AppError('s3Url must include bucket and key', 400, 'VALIDATION_ERROR')
    }

    return { bucket, key }
  }

  throw new AppError(
    'Unrecognized S3 URL format. Expected virtual-hosted or path-style amazonaws.com URL.',
    400,
    'VALIDATION_ERROR',
  )
}
