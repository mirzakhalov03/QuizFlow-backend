import { eq } from 'drizzle-orm'

import { db } from '../database/database'
import { userIntegrations } from '../database/schema'

export default class userIntegration {
  id: string
  userId: string
  accessToken: string
  refreshToken: string
  provider: string
  createdAt: Date
  updatedAt: Date

  constructor(
    id: string,
    userId: string,
    accessToken: string,
    refreshToken: string,
    provider: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id
    this.userId = userId
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.provider = provider
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }
  static async createUserIntegration(userIntegrationData: {
    userId: string
    accessToken: string
    refreshToken: string
    provider: string
    createdAt?: Date
    updatedAt?: Date
  }): Promise<userIntegration> {
    const [newUser] = await db.insert(userIntegrations).values(userIntegrationData).returning()

    return new userIntegration(
      newUser.id,
      newUser.userId,
      newUser.accessToken,
      newUser.refreshToken,
      newUser.provider,
      newUser.createdAt,
      newUser.updatedAt,
    )
  }
  static async findByUserId(userId: string): Promise<userIntegration | null> {
    const userRow = await db
      .select()
      .from(userIntegrations)
      .where(eq(userIntegrations.userId, userId))
      .then((rows) => rows[0])
    if (!userRow) return null

    return new userIntegration(
      userRow.id,
      userRow.userId,
      userRow.accessToken,
      userRow.refreshToken,
      userRow.provider,
      userRow.createdAt,
      userRow.updatedAt,
    )
  }
}
