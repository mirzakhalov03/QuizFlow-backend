import { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AuthRequest } from '../middlewares/authMiddleware'
import authEmailService from '../services/authEmailService'

const COOKIE_ACCESS_TOKEN_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 1000,
}

const COOKIE_REFRESH_TOKEN_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, fullName, password } = req.body
    const { user, accessToken, refreshToken } = await authEmailService.register(
      email,
      fullName,
      password,
    )

    res.cookie('accessToken', accessToken, COOKIE_ACCESS_TOKEN_OPTIONS)
    res.cookie('refreshToken', refreshToken, COOKIE_REFRESH_TOKEN_OPTIONS)

    return res.json(
      successResponse('User registered', {
        user: { id: user.id, email: user.email, fullName: user.fullName },
      }),
    )
  } catch (error) {
    next(error)
  }
}

const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body
    const { user, accessToken, refreshToken } = await authEmailService.login(email, password)

    res.cookie('accessToken', accessToken, COOKIE_ACCESS_TOKEN_OPTIONS)
    res.cookie('refreshToken', refreshToken, COOKIE_REFRESH_TOKEN_OPTIONS)

    return res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/app/dashboard`)
  } catch (error) {
    next(error)
  }
}

const requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body
    await authEmailService.requestPasswordReset(email)

    return res.json(successResponse('Password reset email sent if the account exists', null))
  } catch (error) {
    next(error)
  }
}

const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body
    await authEmailService.resetPassword(token, password)

    return res.json(successResponse('Password has been reset', null))
  } catch (error) {
    next(error)
  }
}

const setPassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body
    await authEmailService.setPassword(req.user!.id, password)

    return res.json(successResponse('Password set successfully', null))
  } catch (error) {
    next(error)
  }
}

export const authEmailController = {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  setPassword,
}
