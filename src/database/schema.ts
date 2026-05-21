import { relations } from 'drizzle-orm'
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  index,
  unique,
  pgEnum,
} from 'drizzle-orm/pg-core'

import { QUESTION_TYPES } from '../types/questionTypes'

export const jobStatusEnum = pgEnum('job_status', ['pending', 'done', 'failed'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  refreshToken: text('refresh_token').unique(),
  password: text('password'),
  passwordResetTokenHash: text('password_reset_token_hash'),
  passwordResetTokenExpiresAt: timestamp('password_reset_token_expires_at', { mode: 'date' }),
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

export const questionTypeEnum = pgEnum('question_type', QUESTION_TYPES)

export const quizzes = pgTable('quizzes', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  title: text('title').notNull(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: questionTypeEnum('type'),
  properties: jsonb('properties').notNull(),
  isTimerEnabled: boolean('is_timer_enabled').notNull().default(false),
  timerDuration: integer('timer_duration'),
  userInstructions: text('user_instructions'),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  uploadedAt: timestamp('uploaded_at', { mode: 'date' }),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
})

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  type: questionTypeEnum('type').notNull(),
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

export const userAnswers = pgTable(
  'user_answers',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    selectedOptionId: uuid('selected_option_id').references(() => questionOptions.id, {
      onDelete: 'cascade',
    }),
    textAnswer: text('text_answer'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('user_answers_user_id_idx').on(table.userId),
    questionIdIdx: index('user_answers_question_id_idx').on(table.questionId),
    userQuestionUnique: unique('user_answers_user_question_unique').on(
      table.userId,
      table.questionId,
    ),
  }),
)

export const quizResults = pgTable(
  'quiz_results',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    totalQuestions: integer('total_questions').notNull(),
    correctAnswers: integer('correct_answers').notNull(),
    wrongAnswers: integer('wrong_answers').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('quiz_results_user_id_idx').on(table.userId),
    quizIdIdx: index('quiz_results_quiz_id_idx').on(table.quizId),
    userQuizUnique: unique('quiz_results_user_quiz_unique').on(table.userId, table.quizId),
  }),
)

export const quizJobs = pgTable(
  'quiz_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'set null' }),
    status: jobStatusEnum('status').notNull().default('pending'),
    requestId: text('request_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('quiz_jobs_user_id_idx').on(table.userId),
    statusIdx: index('quiz_jobs_status_idx').on(table.status),
  }),
)

export const usersRelations = relations(users, ({ many, one }) => ({
  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),
  integrations: many(userIntegrations),
  apiKeys: many(userApiKeys),
  quizzes: many(quizzes),
  answers: many(userAnswers),
  quizResults: many(quizResults),
  quizJobs: many(quizJobs),
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

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  user: one(users, {
    fields: [quizzes.userId],
    references: [users.id],
  }),
  questions: many(questions),
  quizResults: many(quizResults),
}))

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
  options: many(questionOptions),
  answers: many(userAnswers),
}))

export const questionOptionsRelations = relations(questionOptions, ({ one, many }) => ({
  question: one(questions, {
    fields: [questionOptions.questionId],
    references: [questions.id],
  }),
  answers: many(userAnswers),
}))

export const userAnswerRelations = relations(userAnswers, ({ one }) => ({
  user: one(users, {
    fields: [userAnswers.userId],
    references: [users.id],
  }),
  question: one(questions, {
    fields: [userAnswers.questionId],
    references: [questions.id],
  }),
  selectedOption: one(questionOptions, {
    fields: [userAnswers.selectedOptionId],
    references: [questionOptions.id],
  }),
}))

export const quizResultsRelations = relations(quizResults, ({ one }) => ({
  user: one(users, {
    fields: [quizResults.userId],
    references: [users.id],
  }),
  quiz: one(quizzes, {
    fields: [quizResults.quizId],
    references: [quizzes.id],
  }),
}))

export const quizJobsRelations = relations(quizJobs, ({ one }) => ({
  user: one(users, {
    fields: [quizJobs.userId],
    references: [users.id],
  }),
  quiz: one(quizzes, {
    fields: [quizJobs.quizId],
    references: [quizzes.id],
  }),
}))
