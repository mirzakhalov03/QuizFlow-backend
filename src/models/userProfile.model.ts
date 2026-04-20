import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { userProfiles } from '../database/schema'

export type UserProfile = InferSelectModel<typeof userProfiles>
export type NewUserProfile = InferInsertModel<typeof userProfiles>
