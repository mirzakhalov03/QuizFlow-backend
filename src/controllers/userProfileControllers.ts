import { Response } from 'express'

import { AuthRequest } from '../middlewares/authMiddleware'
import userProfile from '../models/userProfile.model'

export const getUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const profile = await userProfile.findByUserId(req.user!.id)

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' })
    }

    return res.json(profile)
  } catch {
    return res.status(500).json({ message: 'Server error' })
  }
}

export const updateUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { bio, profilePicture } = req.body

    const updated = await userProfile.upsert(req.user!.id, bio ?? null, profilePicture ?? null)

    return res.json(updated)
  } catch {
    return res.status(500).json({ message: 'Server error' })
  }
}

export const deleteUserProfile = async (req: AuthRequest, res: Response) => {
  try {
    await userProfile.deleteByUserId(req.user!.id)

    return res.json({ message: 'Profile deleted' })
  } catch {
    return res.status(500).json({ message: 'Server error' })
  }
}
