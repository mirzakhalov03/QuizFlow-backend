import { eq } from 'drizzle-orm'

import { db } from '../database/database'
import { userProfiles } from '../database/schema'

export default class userProfile {
  id: string
  userId: string
  bio: string | null
  profilePicture: string | null
  createdAt: Date
  updatedAt: Date

  constructor(
    id: string,
    userId: string,
    bio: string | null,
    profilePicture: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id
    this.userId = userId
    this.bio = bio
    this.profilePicture = profilePicture
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }
  static async createUserProfile(userProfileData: {
    userId: string
    bio: string | null
    profilePicture: string | null
    createdAt?: Date
    updatedAt?: Date
  }): Promise<userProfile> {
    const [newUserProfile] = await db.insert(userProfiles).values(userProfileData).returning()

    return new userProfile(
      newUserProfile.id,
      newUserProfile.userId,
      newUserProfile.bio,
      newUserProfile.profilePicture,
      newUserProfile.createdAt,
      newUserProfile.updatedAt,
    )
  }
  static async findByUserId(userId: string): Promise<userProfile | null> {
    const userRow = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .then((rows) => rows[0])
    if (!userRow) return null

    return new userProfile(
      userRow.id,
      userRow.userId,
      userRow.bio,
      userRow.profilePicture,
      userRow.createdAt,
      userRow.updatedAt,
    )
  }
}
