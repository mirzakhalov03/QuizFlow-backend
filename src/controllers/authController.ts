import crypto from 'crypto'

import { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { buildGoogleAuthUrl } from '../helpers/utils/buildGoogleAuthUrl'
import { buildNotionAuthUrl } from '../helpers/utils/buildNotionAuthUrl'
import { setAuthCookies, setAccessCookie, clearAuthCookies } from '../helpers/utils/cookies'
import { AuthRequest } from '../middlewares/authMiddleware'
import authService from '../services/auth.service'

const logoutUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.refreshToken

    if (token) {
      await authService.clearRefreshToken(token)
    }

    clearAuthCookies(res)

    return res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}`)
  } catch (error) {
    next(error)
  }
}

const redirectUser = (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString('hex')

  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000, // 10 min — only needs to survive the OAuth round-trip
  })

  return res.redirect(buildGoogleAuthUrl(state))
}

const googleCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.query.code as string
    const state = req.query.state as string
    const storedState = req.cookies.oauth_state

    if (!code) {
      return res.status(400).json({ message: 'No code provided' })
    }

    if (!state || !storedState || state !== storedState) {
      return res.status(400).json({ message: 'Invalid OAuth state' })
    }

    res.clearCookie('oauth_state', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })

    const { accessToken, refreshToken } = await authService.handleGoogleOAuth(code)

    setAuthCookies(res, { accessToken, refreshToken })

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    return res.redirect(`${frontendUrl}/app/analytics`)
  } catch (error) {
    next(error)
  }
}

const redirectToNotion = (req: Request, res: Response) => {
  return res.redirect(buildNotionAuthUrl())
}

const notionCallback = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const code = req.query.code as string
    const error = req.query.error as string
    const user = req.user

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

    if (error || !code) {
      return res.redirect(`${frontendUrl}/integrations/failure?error=access_denied`)
    }

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    await authService.handleNotionOAuth(user.id, code)

    return res.redirect(`${frontendUrl}/integrations/success`)
  } catch (error) {
    next(error)
  }
}

const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.refreshToken

    const newAccessToken = await authService.refreshAccessToken(token)

    setAccessCookie(res, newAccessToken)

    return res.json({ message: 'Token refreshed' })
  } catch (error) {
    next(error)
  }
}

const getMe = async (req: AuthRequest, res: Response) => {
  return res.json(successResponse('User retrieved', req.user))
}
export {
  logoutUser,
  redirectUser,
  googleCallback,
  redirectToNotion,
  notionCallback,
  refreshToken,
  getMe,
}
