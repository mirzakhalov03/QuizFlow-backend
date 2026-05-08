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
  constructor(
    id: string,
    email: string,
    fullName: string,
    createdAt: Date,
    updatedAt: Date,
    refreshToken: string | null,
  ) {
    this.id = id
    this.email = email
    this.fullName = fullName
    this.createdAt = createdAt
    this.updatedAt = updatedAt
    this.refreshToken = refreshToken
  }
  static async createUser(userData: {
    email: string
    fullName: string
    createdAt?: Date
    updatedAt?: Date
    refreshToken?: string | null
  }): Promise<User> {
    const [newUser] = await db.insert(users).values(userData).returning()

    return new User(
      newUser.id,
      newUser.email,
      newUser.fullName,
      newUser.createdAt,
      newUser.updatedAt,
      newUser.refreshToken,
    )
  }
  static async findByEmail(email: string): Promise<User | null> {
    const userRow = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .then((rows) => rows[0])
    if (!userRow) return null

    return new User(
      userRow.id,
      userRow.email,
      userRow.fullName,
      userRow.createdAt,
      userRow.updatedAt,
      userRow.refreshToken,
    )
  }
  static async findById(id: string): Promise<User | null> {
    const userRow = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .then((rows) => rows[0])
    if (!userRow) return null

    return new User(
      userRow.id,
      userRow.email,
      userRow.fullName,
      userRow.createdAt,
      userRow.updatedAt,
      userRow.refreshToken,
    )
  }
  static async updateUser(
    id: string,
    data: {
      email?: string
      fullName?: string
      refreshToken?: string | null
    },
  ): Promise<User | null> {
    const [updated] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning()

    if (!updated) return null

    return new User(
      updated.id,
      updated.email,
      updated.fullName,
      updated.createdAt,
      updated.updatedAt,
      updated.refreshToken,
    )
  }
}
