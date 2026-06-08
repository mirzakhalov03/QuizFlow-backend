import { inArray } from 'drizzle-orm'

import { db } from '../database/database'
import { quizzes } from '../database/schema'
import type { QuestionType } from '../types/questionTypes'

export default class Quiz {
  id: string
  title: string
  userId: string
  type: QuestionType | null
  properties: unknown
  isTimerEnabled: boolean
  timerDuration: number | null
  userInstructions: string | null
  completedAt: Date | null
  createdAt: Date
  uploadedAt: Date | null
  updatedAt: Date

  constructor(
    id: string,
    title: string,
    userId: string,
    type: QuestionType | null,
    properties: unknown,
    isTimerEnabled: boolean,
    timerDuration: number | null,
    userInstructions: string | null,
    completedAt: Date | null,
    createdAt: Date,
    uploadedAt: Date | null,
    updatedAt: Date,
  ) {
    this.id = id
    this.title = title
    this.userId = userId
    this.type = type
    this.properties = properties
    this.isTimerEnabled = isTimerEnabled
    this.timerDuration = timerDuration
    this.userInstructions = userInstructions
    this.completedAt = completedAt
    this.createdAt = createdAt
    this.uploadedAt = uploadedAt
    this.updatedAt = updatedAt
  }

  static async findByIds(ids: string[]): Promise<Quiz[]> {
    if (ids.length === 0) return []

    const rows = await db.select().from(quizzes).where(inArray(quizzes.id, ids))

    return rows.map(
      (row) =>
        new Quiz(
          row.id,
          row.title,
          row.userId,
          row.type ?? null,
          row.properties,
          row.isTimerEnabled,
          row.timerDuration ?? null,
          row.userInstructions ?? null,
          row.completedAt ?? null,
          row.createdAt,
          row.uploadedAt ?? null,
          row.updatedAt,
        ),
    )
  }
}
