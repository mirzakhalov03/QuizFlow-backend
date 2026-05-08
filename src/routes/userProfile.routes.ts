import express from 'express'
import multer from 'multer'

import {
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  updateUser,
  uploadProfilePicture,
} from '../controllers/userProfileControllers'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
})

router.get('/userProfile/me', authMiddleware, getUserProfile)
router.put('/userProfile/me', authMiddleware, updateUserProfile)
router.delete('/userProfile/me', authMiddleware, deleteUserProfile)
router.put('/user/me', authMiddleware, updateUser)
router.put(
  '/userProfile/me/avatar',
  authMiddleware,
  upload.single('profilePicture'),
  uploadProfilePicture,
)

export default router
