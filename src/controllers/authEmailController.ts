import { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { setAuthCookies, clearAuthCookies } from '../helpers/utils/cookies'
import { primaryFrontendUrl } from '../helpers/utils/frontendUrl'
import { AuthRequest } from '../middlewares/authMiddleware'
import authEmailService from '../services/auth-email.service'

const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, fullName, password } = req.body
    await authEmailService.register(email, fullName, password)

    return res.json(successResponse('Verification code sent to your email', null))
  } catch (error) {
    next(error)
  }
}

const confirmRegistration = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body
    const { accessToken, refreshToken } = await authEmailService.confirmRegistration(email, otp)

    setAuthCookies(res, { accessToken, refreshToken })

    return res.redirect(`${primaryFrontendUrl}/app/quizzes`)
  } catch (error) {
    next(error)
  }
}

const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body
    const { accessToken, refreshToken } = await authEmailService.login(email, password)

    setAuthCookies(res, { accessToken, refreshToken })

    return res.redirect(`${primaryFrontendUrl}/app/quizzes`)
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
    const { email, token, password } = req.body
    await authEmailService.resetPassword(email, token, password)

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

const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body
    await authEmailService.changePassword(req.user!.id, currentPassword, newPassword)

    return res.json(successResponse('Password changed successfully', null))
  } catch (error) {
    next(error)
  }
}

const requestDeleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await authEmailService.requestDeleteAccount(req.user!.id)

    return res.json(successResponse('Account deletion code sent to your email', null))
  } catch (error) {
    next(error)
  }
}

const confirmDeleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { otp } = req.body
    await authEmailService.confirmDeleteAccount(req.user!.id, otp)

    clearAuthCookies(res)

    return res.json(successResponse('Account deleted successfully', null))
  } catch (error) {
    next(error)
  }
}

export const authEmailController = {
  register,
  confirmRegistration,
  login,
  requestPasswordReset,
  resetPassword,
  setPassword,
  changePassword,
  requestDeleteAccount,
  confirmDeleteAccount,
}
