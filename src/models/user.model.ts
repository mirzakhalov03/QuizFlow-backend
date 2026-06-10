import { eq } from 'drizzle-orm'

import { db } from '../database/database'
import { users } from '../database/schema'

export default class User {
  id: string
  email: string
  fullName: string
  createdAt: Date
  updatedAt: Date
  refreshToken: string | null
  password: string | null
  isVerified: boolean

  constructor(
    id: string,
    email: string,
    fullName: string,
    createdAt: Date,
    updatedAt: Date,
    refreshToken: string | null,
    password: string | null,
    isVerified: boolean,
  ) {
    this.id = id
    this.email = email
    this.fullName = fullName
    this.createdAt = createdAt
    this.updatedAt = updatedAt
    this.refreshToken = refreshToken
    this.password = password
    this.isVerified = isVerified
  }

  private static fromRow(row: typeof users.$inferSelect): User {
    return new User(
      row.id,
      row.email,
      row.fullName,
      row.createdAt,
      row.updatedAt,
      row.refreshToken ?? null,
      row.password ?? null,
      row.isVerified,
    )
  }

  static async createUser(userData: {
    email: string
    fullName: string
    password?: string | null
    isVerified?: boolean
    refreshToken?: string | null
  }): Promise<User> {
    const [newUser] = await db.insert(users).values(userData).returning()
    return this.fromRow(newUser)
  }

  static async findByEmail(email: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.email, email))
    if (!rows[0]) return null
    return this.fromRow(rows[0])
  }

  static async findById(id: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id))
    if (!rows[0]) return null
    return this.fromRow(rows[0])
  }

  static async updateUser(
    id: string,
    data: {
      email?: string
      fullName?: string
      refreshToken?: string | null
      password?: string | null
      isVerified?: boolean
    },
  ): Promise<User | null> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()

    if (!updated) return null
    return this.fromRow(updated)
  }
}
