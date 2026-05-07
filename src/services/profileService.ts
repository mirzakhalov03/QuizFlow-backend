import userProfile from '../models/userProfile.model'

type GoogleProfile = {
  email?: string
  name?: string
  picture?: string | null
  [key: string]: unknown
}

class ProfileService {
  async ensureProfile(userId: string, profile: GoogleProfile) {
    const existing = await userProfile.findByUserId(userId)

    if (existing) return existing

    return await userProfile.createUserProfile({
      userId,
      bio: null,
      profilePicture: profile.picture ?? null,
    })
  }
}

export default new ProfileService()
