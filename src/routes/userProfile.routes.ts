import express, { Response } from 'express'

import {
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
} from '../controllers/userProfileControllers'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = express.Router()

router.get('/userProfile/me', authMiddleware, getUserProfile)
router.put('/userProfile/me', authMiddleware, updateUserProfile)
router.delete('/userProfile/me', authMiddleware, deleteUserProfile)

export default router
