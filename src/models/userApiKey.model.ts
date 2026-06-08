import { desc, eq } from 'drizzle-orm'

import { db } from '../database/database'
import { userApiKeys } from '../database/schema'
import { decryptApiKeyValue } from '../helpers/apiKeyCrypto'

export default class UserApiKey {
  id: string
  userId: string
  keyName: string
  keyValue: string
  createdAt: Date
  updatedAt: Date

  constructor(
    id: string,
    userId: string,
    keyName: string,
    keyValue: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id
    this.userId = userId
    this.keyName = keyName
    this.keyValue = keyValue
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }

  static async findLatestByUserId(userId: string): Promise<UserApiKey | null> {
    const rows = await db
      .select()
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, userId))
      .orderBy(desc(userApiKeys.createdAt))
      .limit(1)

    const row = rows[0]
    if (!row) return null

    return new UserApiKey(
      row.id,
      row.userId,
      row.keyName,
      row.keyValue,
      row.createdAt,
      row.updatedAt,
    )
  }

  decrypted(): string {
    return decryptApiKeyValue(this.keyValue)
  }
}
