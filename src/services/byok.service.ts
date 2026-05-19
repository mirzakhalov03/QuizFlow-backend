import { and, desc, eq } from 'drizzle-orm'

import { db } from '../database/database'
import { userApiKeys } from '../database/schema'
import { decryptApiKeyValue, encryptApiKeyValue, maskApiKeyValue } from '../helpers/apiKeyCrypto'

type CreateInput = {
  userId: string
  keyName: string
  keyValue: string
}

type UpdateInput = {
  keyName?: string
  keyValue?: string
}

const toSafeView = (row: typeof userApiKeys.$inferSelect) => ({
  id: row.id,
  keyName: row.keyName,
  maskedKey: maskApiKeyValue(decryptApiKeyValue(row.keyValue)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const createByok = async ({ userId, keyName, keyValue }: CreateInput) => {
  const encryptedValue = encryptApiKeyValue(keyValue)

  const [row] = await db
    .insert(userApiKeys)
    .values({ userId, keyName, keyValue: encryptedValue })
    .returning()

  return toSafeView(row)
}

export const listByok = async (userId: string) => {
  const rows = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .orderBy(desc(userApiKeys.createdAt))

  return rows.map(toSafeView)
}

export const updateByok = async (id: string, userId: string, data: UpdateInput) => {
  const updatePayload: { keyName?: string; keyValue?: string } = {}
  if (data.keyName !== undefined) updatePayload.keyName = data.keyName
  if (data.keyValue !== undefined) updatePayload.keyValue = encryptApiKeyValue(data.keyValue)

  const [row] = await db
    .update(userApiKeys)
    .set(updatePayload)
    .where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)))
    .returning()

  return row ? toSafeView(row) : null
}

export const deleteByok = async (id: string, userId: string) => {
  const deleted = await db
    .delete(userApiKeys)
    .where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)))
    .returning({ id: userApiKeys.id })

  return deleted.length > 0
}
