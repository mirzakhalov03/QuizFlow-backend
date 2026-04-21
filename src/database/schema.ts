import { relations } from 'drizzle-orm'
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  profilePicture: text('profile_picture'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const userIntegrations = pgTable('user_integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  provider: text('provider').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const userApiKeys = pgTable('user_api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  keyName: text('key_name').notNull(),
  keyValue: text('key_value').notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const usersRelations = relations(users, ({ many, one }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  integrations: many(userIntegrations),
  apiKeys: many(userApiKeys),
}))

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}))

export const userIntegrationsRelations = relations(userIntegrations, ({ one }) => ({
  user: one(users, {
    fields: [userIntegrations.userId],
    references: [users.id],
  }),
}))

export const userApiKeysRelations = relations(userApiKeys, ({ one }) => ({
  user: one(users, {
    fields: [userApiKeys.userId],
    references: [users.id],
  }),
}))

/*--- Quizzez ---*/

export const questionTypeEnum = pgEnum('question_type', [
  'single_choice',
  'multiple_choice',
  'text',
  'true_false',
])

export const quizzes = pgTable('quizzes', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),

  title: text('title').notNull(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),

  type: questionTypeEnum('type'),

  properties: jsonb('properties').notNull(),

  isTimerEnabled: boolean('is_timer_enabled').notNull().default(false),

  timerDuration: integer('timer_duration'),

  completeBy: timestamp('complete_by', { mode: 'date' }),

  userInstructions: text('user_instructions'),

  completedAt: timestamp('completed_at', { mode: 'date' }),

  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),

  uploadedAt: timestamp('uploaded_at', { mode: 'date' }),
})

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),

  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),

  text: text('text').notNull(),

  type: questionTypeEnum('type').notNull(),
  //Don't miss this one guys(ladies ?_?), it is for question's position in the list
  position: integer('position').notNull(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),

  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const questionOptions = pgTable('question_options', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),

  questionId: uuid('question_id')
    .notNull()
    .references(() => questions.id, { onDelete: 'cascade' }),

  text: text('text').notNull(),

  explanation: text('explanation'),

  isCorrect: boolean('is_correct').notNull().default(false),

  position: integer('position').notNull(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),

  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})
