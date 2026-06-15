import { eq } from 'drizzle-orm'

import { db } from '../database/database'
import { userProfiles } from '../database/schema'

export default class userProfile {
  id: string
  userId: string
  bio: string | null
  profilePicture: string | null
  isOnboarded: boolean
  aiFeedback: unknown | null
  aiFeedbackGeneratedAt: Date | null
  createdAt: Date
  updatedAt: Date

  constructor(
    id: string,
    userId: string,
    bio: string | null,
    profilePicture: string | null,
    isOnboarded: boolean,
    aiFeedback: unknown | null,
    aiFeedbackGeneratedAt: Date | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id
    this.userId = userId
    this.bio = bio
    this.profilePicture = profilePicture
    this.isOnboarded = isOnboarded
    this.aiFeedback = aiFeedback
    this.aiFeedbackGeneratedAt = aiFeedbackGeneratedAt
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }

  static async create(userId: string, bio: string | null, profilePicture: string | null) {
    const [row] = await db.insert(userProfiles).values({ userId, bio, profilePicture }).returning()

    return new userProfile(
      row.id,
      row.userId,
      row.bio,
      row.profilePicture,
      row.isOnboarded,
      row.aiFeedback,
      row.aiFeedbackGeneratedAt,
      row.createdAt,
      row.updatedAt,
    )
  }

  static async findOrCreate(
    userId: string,
    bio: string | null = null,
    profilePicture: string | null = null,
  ): Promise<userProfile> {
    const [row] = await db
      .insert(userProfiles)
      .values({ userId, bio, profilePicture })
      .onConflictDoNothing({ target: userProfiles.userId })
      .returning()

    if (row) {
      return new userProfile(
        row.id,
        row.userId,
        row.bio,
        row.profilePicture,
        row.isOnboarded,
        row.aiFeedback,
        row.aiFeedbackGeneratedAt,
        row.createdAt,
        row.updatedAt,
      )
    }

    // Row already existed (conflict) — return the existing one.
    const existing = await this.findByUserId(userId)
    return existing as userProfile
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
      row.isOnboarded,
      row.aiFeedback,
      row.aiFeedbackGeneratedAt,
      row.createdAt,
      row.updatedAt,
    )
  }

  static async upsert(
    userId: string,
    bio?: string | null,
    profilePicture?: string | null,
    isOnboarded?: boolean,
  ) {
    const existing = await this.findByUserId(userId)

    if (!existing) {
      return this.create(userId, bio ?? null, profilePicture ?? null)
    }

    const [updated] = await db
      .update(userProfiles)
      .set({
        bio: bio ?? existing.bio,
        profilePicture: profilePicture ?? existing.profilePicture,
        isOnboarded: isOnboarded ?? existing.isOnboarded,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning()

    return new userProfile(
      updated.id,
      updated.userId,
      updated.bio,
      updated.profilePicture,
      updated.isOnboarded,
      updated.aiFeedback,
      updated.aiFeedbackGeneratedAt,
      updated.createdAt,
      updated.updatedAt,
    )
  }

  static async deleteByUserId(userId: string) {
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId))
  }

  static async fetchUserBio(userId: string) {
    const [profile] = await db
      .select({ bio: userProfiles.bio })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))

    return profile?.bio
  }
}
