import userProfile from '../models/userProfile.model'

type GoogleProfile = {
  email?: string
  name?: string
  picture?: string | null
  [key: string]: unknown
}

class ProfileService {
  async ensureProfile(userId: string, profile?: GoogleProfile) {
    return await userProfile.findOrCreate(userId, null, profile?.picture ?? null)
  }

  async getProfileBio(userId: string) {
    return await userProfile.fetchUserBio(userId)
  }
}

export default new ProfileService()
