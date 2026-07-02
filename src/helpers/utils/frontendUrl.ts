const DEFAULT_FRONTEND_URL = 'http://localhost:5173'

/**
 * `FRONTEND_URL` may hold a comma-separated list of allowed frontend origins.
 * The full list is used as the CORS allowlist; the first entry is treated as
 * the canonical origin for building redirect targets and email links.
 */
export const allowedOrigins = (process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const primaryFrontendUrl = allowedOrigins[0] ?? DEFAULT_FRONTEND_URL
