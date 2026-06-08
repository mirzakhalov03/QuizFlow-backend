import { eq, inArray } from 'drizzle-orm'

import { db } from '../database/database'
import { questions } from '../database/schema'
import type { QuestionType } from '../types/questionTypes'

export default class Question {
  id: string
  quizId: string
  text: string
  type: QuestionType
  position: number
  createdAt: Date
  updatedAt: Date

  constructor(
    id: string,
    quizId: string,
    text: string,
    type: QuestionType,
    position: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id
    this.quizId = quizId
    this.text = text
    this.type = type
    this.position = position
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }

  static async findByIds(ids: string[]): Promise<Question[]> {
    if (ids.length === 0) return []

    const rows = await db.select().from(questions).where(inArray(questions.id, ids))

    return rows.map(
      (row) =>
        new Question(
          row.id,
          row.quizId,
          row.text,
          row.type,
          row.position,
          row.createdAt,
          row.updatedAt,
        ),
    )
  }

  static async findByQuizId(quizId: string): Promise<Question[]> {
    const rows = await db.select().from(questions).where(eq(questions.quizId, quizId))

    return rows.map(
      (row) =>
        new Question(
          row.id,
          row.quizId,
          row.text,
          row.type,
          row.position,
          row.createdAt,
          row.updatedAt,
        ),
    )
  }
}
