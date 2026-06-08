import { eq, inArray } from 'drizzle-orm'

import { db } from '../database/database'
import { questionOptions } from '../database/schema'

export default class QuestionOption {
  id: string
  questionId: string
  text: string
  explanation: string | null
  isCorrect: boolean
  position: number
  createdAt: Date
  updatedAt: Date

  constructor(
    id: string,
    questionId: string,
    text: string,
    explanation: string | null,
    isCorrect: boolean,
    position: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id
    this.questionId = questionId
    this.text = text
    this.explanation = explanation
    this.isCorrect = isCorrect
    this.position = position
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }

  static async findByIds(ids: string[]): Promise<QuestionOption[]> {
    if (ids.length === 0) return []

    const rows = await db.select().from(questionOptions).where(inArray(questionOptions.id, ids))

    return rows.map(
      (row) =>
        new QuestionOption(
          row.id,
          row.questionId,
          row.text,
          row.explanation ?? null,
          row.isCorrect,
          row.position,
          row.createdAt,
          row.updatedAt,
        ),
    )
  }

  static async findCorrectByQuestionIds(questionIds: string[]): Promise<QuestionOption[]> {
    if (questionIds.length === 0) return []

    const rows = await db
      .select()
      .from(questionOptions)
      .where(inArray(questionOptions.questionId, questionIds))

    return rows
      .filter((row) => row.isCorrect)
      .map(
        (row) =>
          new QuestionOption(
            row.id,
            row.questionId,
            row.text,
            row.explanation ?? null,
            row.isCorrect,
            row.position,
            row.createdAt,
            row.updatedAt,
          ),
      )
  }
}
