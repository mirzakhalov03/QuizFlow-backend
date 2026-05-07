import { NextFunction, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AuthRequest } from '../middlewares/authMiddleware'
import User from '../models/user.model'
import userProfile from '../models/userProfile.model'
import UserProfileImageService from '../services/userProfileImageService'

export const getUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await userProfile.findByUserId(req.user!.id)

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' })
    }

    return res.json(profile)
  } catch (error) {
    next(error)
  }
}

export const updateUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bio, profilePicture } = req.body

    const updated = await userProfile.upsert(req.user!.id, bio ?? null, profilePicture ?? null)

    return res.json(updated)
  } catch (error) {
    next(error)
  }
}

export const deleteUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await userProfile.deleteByUserId(req.user!.id)

    return res.json({ message: 'Profile deleted' })
  } catch (error) {
    next(error)
  }
}

export const updateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id

    const { email, fullName, refreshToken } = req.body

    const updatedUser = await User.updateUser(userId, {
      email,
      fullName,
      refreshToken,
    })

    if (!updatedUser) {
      return res.status(404).json({
        message: 'User not found',
      })
    }

    return res.status(200).json(updatedUser)
  } catch (error) {
    next(error)
  }
}
export const uploadProfilePicture = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id

  if (!userId) {
    throw new Error('Unauthorized')
  }

  const file = req.file

  const updatedProfile = await UserProfileImageService.uploadProfileImage(
    userId,
    file as Express.Multer.File,
  )

  return res
    .status(200)
    .json(successResponse('Profile picture updated successfully', updatedProfile))
}
