import bcrypt from 'bcryptjs'

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

  async createUserWithPassword(data: {
    email: string
    fullName: string
    password: string
    isVerified?: boolean
  }) {
    const passwordHash = await bcrypt.hash(data.password, 10)

    return await User.createUser({
      email: data.email,
      fullName: data.fullName,
      password: passwordHash,
      isVerified: data.isVerified ?? false,
    })
  }

  async verifyCredentials(email: string, password: string) {
    const user = await this.findByEmail(email)
    if (!user || !user.password) return null

    const isValid = await bcrypt.compare(password, user.password)
    return isValid ? user : null
  }

  async findOrCreateByGoogle(profile: GoogleProfile) {
    const existingUser = await this.findByEmail(profile.email)

    if (existingUser) {
      if (!existingUser.isVerified) {
        await User.updateUser(existingUser.id, { isVerified: true })
      }
      return existingUser
    }

    return await User.createUser({
      email: profile.email,
      fullName: profile.name,
      isVerified: true,
    })
  }

  async updateUser(
    id: string,
    data: {
      fullName?: string
      password?: string | null
      refreshToken?: string | null
      isVerified?: boolean
    },
  ) {
    return await User.updateUser(id, data)
  }
}

export default new UserService()
