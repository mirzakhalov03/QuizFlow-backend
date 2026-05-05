import express, { Response } from 'express'

import {
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
} from '../controllers/userProfileControllers'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = express.Router()

router.get('/me', authMiddleware, getUserProfile)
router.put('/me', authMiddleware, updateUserProfile)
router.delete('/me', authMiddleware, deleteUserProfile)

export default router
