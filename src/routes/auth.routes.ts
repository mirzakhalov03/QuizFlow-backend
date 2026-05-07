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
import { authMiddleware } from '../middlewares/authMiddleware'
const router = express.Router()

router.get('/auth/google', redirectUser)
router.get('/auth/google/callback', googleCallback)
router.get('/auth/notion', authMiddleware, redirectToNotion)
router.get('/auth/notion/callback', authMiddleware, notionCallback)
router.post('/auth/logout', logoutUser)
router.get('/auth/me', authMiddleware, getMe)
router.post('/auth/refresh', refreshToken)
export default router
