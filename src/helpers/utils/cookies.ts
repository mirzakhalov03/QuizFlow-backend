import type { Response } from 'express'

const ACCESS_TOKEN_MAX_AGE = 60 * 60 * 1000 // 1h — matches access JWT expiry
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7d — matches refresh JWT expiry

const baseOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
})

export const setAccessCookie = (res: Response, token: string) =>
  res.cookie('accessToken', token, { ...baseOptions(), maxAge: ACCESS_TOKEN_MAX_AGE })

export const setRefreshCookie = (res: Response, token: string) =>
  res.cookie('refreshToken', token, { ...baseOptions(), maxAge: REFRESH_TOKEN_MAX_AGE })

export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) => {
  setAccessCookie(res, tokens.accessToken)
  setRefreshCookie(res, tokens.refreshToken)
}

export const clearAuthCookies = (res: Response) => {
  const options = baseOptions()
  res.clearCookie('accessToken', options)
  res.clearCookie('refreshToken', options)
}
