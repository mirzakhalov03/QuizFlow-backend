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
import { validate } from '../middlewares/validate'
import {
  AuthLoginSchema,
  AuthRegisterSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  SetPasswordSchema,
} from '../validators/auth.schema'

const router = express.Router()

router.post('/auth/register', validate(AuthRegisterSchema), authEmailController.register)
router.post('/auth/login', validate(AuthLoginSchema), authEmailController.login)
router.post(
  '/auth/password-reset',
  validate(PasswordResetRequestSchema),
  authEmailController.requestPasswordReset,
)
router.post(
  '/auth/password-reset/confirm',
  validate(PasswordResetConfirmSchema),
  authEmailController.resetPassword,
)
router.post(
  '/auth/set-password',
  authMiddleware,
  validate(SetPasswordSchema),
  authEmailController.setPassword,
)
router.get('/auth/google', redirectUser)
router.get('/auth/google/callback', googleCallback)
router.get('/auth/notion', authMiddleware, redirectToNotion)
router.get('/auth/notion/callback', authMiddleware, notionCallback)
router.post('/auth/logout', logoutUser)
router.get('/auth/me', authMiddleware, getMe)
router.post('/auth/refresh', refreshToken)
export default router
