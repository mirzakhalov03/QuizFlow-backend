import { and, eq, gt } from 'drizzle-orm'

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
  passwordResetTokenHash: string | null
  passwordResetTokenExpiresAt: Date | null

  constructor(
    id: string,
    email: string,
    fullName: string,
    createdAt: Date,
    updatedAt: Date,
    refreshToken: string | null,
    password: string | null,
    passwordResetTokenHash: string | null,
    passwordResetTokenExpiresAt: Date | null,
  ) {
    this.id = id
    this.email = email
    this.fullName = fullName
    this.createdAt = createdAt
    this.updatedAt = updatedAt
    this.refreshToken = refreshToken
    this.password = password
    this.passwordResetTokenHash = passwordResetTokenHash
    this.passwordResetTokenExpiresAt = passwordResetTokenExpiresAt
  }

  static async createUser(userData: {
    email: string
    fullName: string
    createdAt?: Date
    updatedAt?: Date
    refreshToken?: string | null
    password?: string | null
    passwordResetTokenHash?: string | null
    passwordResetTokenExpiresAt?: Date | null
  }): Promise<User> {
    const [newUser] = await db.insert(users).values(userData).returning()

    return new User(
      newUser.id,
      newUser.email,
      newUser.fullName,
      newUser.createdAt,
      newUser.updatedAt,
      newUser.refreshToken,
      newUser.password ?? null,
      newUser.passwordResetTokenHash ?? null,
      newUser.passwordResetTokenExpiresAt ?? null,
    )
  }

  static async findByEmail(email: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.email, email))
    const userRow = rows[0]
    if (!userRow) return null

    return new User(
      userRow.id,
      userRow.email,
      userRow.fullName,
      userRow.createdAt,
      userRow.updatedAt,
      userRow.refreshToken,
      userRow.password ?? null,
      userRow.passwordResetTokenHash ?? null,
      userRow.passwordResetTokenExpiresAt ?? null,
    )
  }

  static async findById(id: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.id, id))
    const userRow = rows[0]
    if (!userRow) return null

    return new User(
      userRow.id,
      userRow.email,
      userRow.fullName,
      userRow.createdAt,
      userRow.updatedAt,
      userRow.refreshToken,
      userRow.password ?? null,
      userRow.passwordResetTokenHash ?? null,
      userRow.passwordResetTokenExpiresAt ?? null,
    )
  }

  static async findByPasswordResetTokenHash(tokenHash: string): Promise<User | null> {
    const rows = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.passwordResetTokenHash, tokenHash),
          gt(users.passwordResetTokenExpiresAt, new Date()),
        ),
      )
    const userRow = rows[0]

    if (!userRow) return null

    return new User(
      userRow.id,
      userRow.email,
      userRow.fullName,
      userRow.createdAt,
      userRow.updatedAt,
      userRow.refreshToken,
      userRow.password ?? null,
      userRow.passwordResetTokenHash ?? null,
      userRow.passwordResetTokenExpiresAt ?? null,
    )
  }

  static async updateUser(
    id: string,
    data: {
      email?: string
      fullName?: string
      refreshToken?: string | null
      password?: string | null
      passwordResetTokenHash?: string | null
      passwordResetTokenExpiresAt?: Date | null
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
      updated.password ?? null,
      updated.passwordResetTokenHash ?? null,
      updated.passwordResetTokenExpiresAt ?? null,
    )
  }
}
