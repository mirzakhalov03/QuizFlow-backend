import { and, desc, eq } from 'drizzle-orm'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { db } from '../database/database'
import * as schema from '../database/schema'
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
  provider: row.provider,
  maskedKey: maskApiKeyValue(decryptApiKeyValue(row.keyValue)),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const createByok = async ({
  userId,
  keyName,
  keyValue,
  provider,
}: CreateInput & { provider: string }) => {
  const encryptedValue = encryptApiKeyValue(keyValue)

  const [row] = await db
    .insert(userApiKeys)
    .values({ userId, keyName, provider, keyValue: encryptedValue })
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

export const updateByok = async (
  id: string,
  userId: string,
  data: UpdateInput & { provider?: string },
) => {
  const updatePayload: { keyName?: string; keyValue?: string; provider?: string } = {}
  if (data.keyName) updatePayload.keyName = data.keyName
  if (data.keyValue) updatePayload.keyValue = encryptApiKeyValue(data.keyValue)
  if (data.provider) updatePayload.provider = data.provider

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

export const getByokById = async (
  id: string,
  userId: string,
  dbClient: NodePgDatabase<typeof schema>,
) => {
  const row = await dbClient
    .select({ encryptedKeyValue: userApiKeys.keyValue })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId)))
  const encryptedKeyValue = row[0]?.encryptedKeyValue
  return encryptedKeyValue ? decryptApiKeyValue(encryptedKeyValue) : undefined
}
