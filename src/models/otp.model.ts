import crypto from 'crypto'

import { eq } from 'drizzle-orm'

import { db } from '../database/database'
import { otps } from '../database/schema'

export const OTP_EXPIRATION_MS = 1000 * 60 * 15 // 15 minutes
export const RESET_EXPIRATION_MS = 1000 * 60 * 60 // 1 hour

export default class Otp {
  id: string
  key: string
  code: string
  expiresAt: Date
  createdAt: Date

  constructor(id: string, key: string, code: string, expiresAt: Date, createdAt: Date) {
    this.id = id
    this.key = key
    this.code = code
    this.expiresAt = expiresAt
    this.createdAt = createdAt
  }

  static generateCode(): string {
    return crypto.randomInt(100000, 1000000).toString()
  }

  static async upsert(key: string, code: string, ttlMs: number = OTP_EXPIRATION_MS): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs)

    await db.insert(otps).values({ key, code, expiresAt }).onConflictDoUpdate({
      target: otps.key,
      set: { code, expiresAt },
    })
  }

  static async verify(key: string, code: string): Promise<'valid' | 'invalid' | 'expired'> {
    const rows = await db.select().from(otps).where(eq(otps.key, key)).limit(1)
    const row = rows[0]

    if (!row || row.code !== code) return 'invalid'
    if (new Date() > row.expiresAt) return 'expired'

    return 'valid'
  }

  static async delete(key: string): Promise<void> {
    await db.delete(otps).where(eq(otps.key, key))
  }
}
