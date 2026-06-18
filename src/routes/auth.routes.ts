import express from 'express'

import {
  logoutUser,
  redirectUser,
  googleCallback,
  notionCallback,
  redirectToNotion,
  refreshToken,
  getMe,
} from '../controllers/authController'
import { authEmailController } from '../controllers/authEmailController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { authLimiter, otpVerifyLimiter } from '../middlewares/rateLimit'
import { validate } from '../middlewares/validate'
import {
  AuthLoginSchema,
  AuthRegisterSchema,
  ChangePasswordSchema,
  DeleteAccountConfirmSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  RegisterConfirmSchema,
  SetPasswordSchema,
} from '../validators/auth.schema'

const router = express.Router()

router.post(
  '/auth/register',
  authLimiter,
  validate(AuthRegisterSchema),
  authEmailController.register,
)
router.post(
  '/auth/register/confirm',
  otpVerifyLimiter,
  validate(RegisterConfirmSchema),
  authEmailController.confirmRegistration,
)
router.post('/auth/login', otpVerifyLimiter, validate(AuthLoginSchema), authEmailController.login)
router.post(
  '/auth/password-reset',
  validate(PasswordResetRequestSchema),
  authLimiter,
  authEmailController.requestPasswordReset,
)
router.post(
  '/auth/password-reset/confirm',
  validate(PasswordResetConfirmSchema),
  otpVerifyLimiter,
  authEmailController.resetPassword,
)
router.post(
  '/auth/set-password',
  authMiddleware,
  validate(SetPasswordSchema),
  authEmailController.setPassword,
)
router.post(
  '/auth/change-password',
  authMiddleware,
  otpVerifyLimiter,
  validate(ChangePasswordSchema),
  authEmailController.changePassword,
)
router.post(
  '/auth/delete-account/request',
  authMiddleware,
  authEmailController.requestDeleteAccount,
)
router.post(
  '/auth/delete-account/confirm',
  authMiddleware,
  otpVerifyLimiter,
  validate(DeleteAccountConfirmSchema),
  authEmailController.confirmDeleteAccount,
)
router.get('/auth/google', redirectUser)
router.get('/auth/google/callback', googleCallback)
router.get('/auth/notion', authMiddleware, redirectToNotion)
router.get('/auth/notion/callback', authMiddleware, notionCallback)
router.post('/auth/logout', logoutUser)
router.get('/auth/me', authMiddleware, getMe)
router.post('/auth/refresh', refreshToken)

export default router
