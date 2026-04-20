import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { userIntegrations } from '../database/schema'

export type UserIntegration = InferSelectModel<typeof userIntegrations>
export type NewUserIntegration = InferInsertModel<typeof userIntegrations>
