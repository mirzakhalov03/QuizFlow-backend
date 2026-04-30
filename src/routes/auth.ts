import express from 'express'

import {
  logoutUser,
  redirectUser,
  googleCallback,
  notionCallback,
  redirectToNotion,
} from '../controllers/authController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { AuthRequest } from '../middlewares/authMiddleware'
const router = express.Router()

router.get('/google', redirectUser)
router.get('/google/callback', googleCallback)
router.get('/notion', redirectToNotion)
router.get('/notion/callback', notionCallback)
router.post('/logout', logoutUser)
router.get('/me', authMiddleware, (req: AuthRequest, res: express.Response) => {
  return res.json(req.user)
})
export default router
