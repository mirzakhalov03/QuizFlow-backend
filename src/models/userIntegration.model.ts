import { eq, and } from 'drizzle-orm'

import { db } from '../database/database'
import { userIntegrations } from '../database/schema'

export default class UserIntegrations {
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
    this.createdAt = createdAt
    this.updatedAt = updatedAt
    this.refreshToken = refreshToken
    this.provider = provider
  }
  static async createUser(userData: {
    userId: string
    accessToken: string
    refreshToken: string
    provider: string
    createdAt?: Date
    updatedAt?: Date
  }): Promise<UserIntegrations> {
    const [newUserIntegrations] = await db.insert(userIntegrations).values(userData).returning()

    return new UserIntegrations(
      newUserIntegrations.id,
      newUserIntegrations.userId,
      newUserIntegrations.accessToken,
      newUserIntegrations.refreshToken,
      newUserIntegrations.provider,
      newUserIntegrations.createdAt,
      newUserIntegrations.updatedAt,
    )
  }
  static async findAllByUserId(userId: string): Promise<UserIntegrations[]> {
    const rows = await db.select().from(userIntegrations).where(eq(userIntegrations.userId, userId))

    return rows.map(
      (row) =>
        new UserIntegrations(
          row.id,
          row.userId,
          row.accessToken,
          row.refreshToken,
          row.provider,
          row.createdAt,
          row.updatedAt,
        ),
    )
  }

  static async findByUserIdAndProvider(userId: string, provider: string) {
    const row = await db
      .select()
      .from(userIntegrations)
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)))
      .then((rows) => rows[0])

    if (!row) return null

    return new UserIntegrations(
      row.id,
      row.userId,
      row.accessToken,
      row.refreshToken,
      row.provider,
      row.createdAt,
      row.updatedAt,
    )
  }
  static async updateByUserIdAndProvider(
    userId: string,
    provider: string,
    data: {
      accessToken?: string
      refreshToken?: string
    },
  ): Promise<void> {
    await db
      .update(userIntegrations)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)))
  }

  static async deleteByUserIdAndProvider(userId: string, provider: string): Promise<void> {
    await db
      .delete(userIntegrations)
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, provider)))
  }
}
