import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { userApiKeys } from '../database/schema'

export type UserApiKey = InferSelectModel<typeof userApiKeys>
export type NewUserApiKey = InferInsertModel<typeof userApiKeys>
