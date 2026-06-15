import { NextFunction, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AuthRequest } from '../middlewares/authMiddleware'
import User from '../models/user.model'
import userProfile from '../models/userProfile.model'
import UserProfileImageService from '../services/user-profile-image.service'

export const getUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Auto-provision a default profile when missing. Email-registered users never
    // get one created at signup (only the Google OAuth path calls ensureProfile),
    // so without this they'd 404 here and never see onboarding (isOnboarded stays null).
    const profile =
      (await userProfile.findByUserId(req.user!.id)) ??
      (await userProfile.create(req.user!.id, null, null))

    return res.json(profile)
  } catch (error) {
    next(error)
  }
}

export const updateUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bio, profilePicture, isOnboarded } = req.body

    const updated = await userProfile.upsert(
      req.user!.id,
      bio ?? null,
      profilePicture ?? null,
      isOnboarded,
    )

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

    const { email, fullName } = req.body

    const updatedUser = await User.updateUser(userId, {
      email,
      fullName,
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
export const uploadProfilePicture = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.id

  if (!userId) {
    throw new Error('Unauthorized')
  }

  const file = req.file
  try {
    const updatedProfile = await UserProfileImageService.uploadProfileImage(
      userId,
      file as Express.Multer.File,
    )

    return res
      .status(200)
      .json(successResponse('Profile picture updated successfully', updatedProfile))
  } catch (error) {
    next(error)
  }
}
