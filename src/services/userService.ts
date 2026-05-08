import User from '../models/user.model'

type GoogleProfile = {
  email: string
  name: string
  picture?: string
  [key: string]: unknown
}

class UserService {
  async findByEmail(email: string) {
    return await User.findByEmail(email)
  }

  async createUser(data: { email: string; fullName: string }) {
    return await User.createUser({
      email: data.email,
      fullName: data.fullName,
    })
  }

  async findOrCreateByGoogle(profile: GoogleProfile) {
    const existingUser = await this.findByEmail(profile.email)

    if (existingUser) return existingUser

    return await this.createUser({
      email: profile.email,
      fullName: profile.name,
    })
  }
  async updateUser(
    id: string,
    data: {
      fullName?: string
    },
  ) {
    return await User.updateUser(id, data)
  }
}

export default new UserService()
