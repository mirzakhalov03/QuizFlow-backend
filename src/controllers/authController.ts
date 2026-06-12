import { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { buildGoogleAuthUrl } from '../helpers/utils/buildGoogleAuthUrl'
import { buildNotionAuthUrl } from '../helpers/utils/buildNotionAuthUrl'
import { AuthRequest } from '../middlewares/authMiddleware'
import authService from '../services/auth.service'

const logoutUser = (req: Request, res: Response, next: NextFunction) => {
  try {
    res.clearCookie('accessToken')
    res.clearCookie('refreshToken')

    return res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}`)
  } catch (error) {
    next(error)
  }
}

const redirectUser = (req: Request, res: Response) => {
  return res.redirect(buildGoogleAuthUrl())
}

const googleCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = req.query.code as string

    if (!code) {
      return res.status(400).json({ message: 'No code provided' })
    }

    const { accessToken, refreshToken } = await authService.handleGoogleOAuth(code)

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1h — matches JWT expiry
    })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7d — matches JWT expiry
    })

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

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      sameSite: 'lax',
    })

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
