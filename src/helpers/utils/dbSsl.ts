export const getDatabaseRejectUnauthorized = (): boolean => {
  if (process.env.DATABASE_REJECT_UNAUTHORIZED !== undefined) {
    return process.env.DATABASE_REJECT_UNAUTHORIZED.toLowerCase() === 'true'
  }

  return process.env.NODE_ENV === 'production'
}
