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
  static async create(userId: string, bio: string | null, profilePicture: string | null) {
    const [row] = await db
      .insert(userProfiles)
      .values({
        userId,
        bio,
        profilePicture,
      })
      .returning()

    return new userProfile(
      row.id,
      row.userId,
      row.bio,
      row.profilePicture,
      row.createdAt,
      row.updatedAt,
    )
  }

  static async findByUserId(userId: string): Promise<userProfile | null> {
    const row = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .then((rows) => rows[0])

    if (!row) return null

    return new userProfile(
      row.id,
      row.userId,
      row.bio,
      row.profilePicture,
      row.createdAt,
      row.updatedAt,
    )
  }

  static async upsert(userId: string, bio?: string | null, profilePicture?: string | null) {
    const existing = await this.findByUserId(userId)

    if (!existing) {
      return this.create(userId, bio ?? null, profilePicture ?? null)
    }

    const [updated] = await db
      .update(userProfiles)
      .set({
        bio: bio ?? existing.bio,
        profilePicture: profilePicture ?? existing.profilePicture,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning()

    return new userProfile(
      updated.id,
      updated.userId,
      updated.bio,
      updated.profilePicture,
      updated.createdAt,
      updated.updatedAt,
    )
  }
  static async deleteByUserId(userId: string) {
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId))
  }
}
