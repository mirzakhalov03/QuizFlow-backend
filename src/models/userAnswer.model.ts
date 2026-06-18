import { eq } from 'drizzle-orm'

import { db } from '../database/database'
import { userAnswers } from '../database/schema'

export default class UserAnswer {
  id: string
  userId: string
  questionId: string
  selectedOptionId: string | null
  selectedOptionIds: string[] | null
  textAnswer: string | null
  createdAt: Date
  updatedAt: Date

  constructor(
    id: string,
    userId: string,
    questionId: string,
    selectedOptionId: string | null,
    selectedOptionIds: string[] | null,
    textAnswer: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id
    this.userId = userId
    this.questionId = questionId
    this.selectedOptionId = selectedOptionId
    this.selectedOptionIds = selectedOptionIds
    this.textAnswer = textAnswer
    this.createdAt = createdAt
    this.updatedAt = updatedAt
  }

  static async findByUserId(userId: string): Promise<UserAnswer[]> {
    const rows = await db.select().from(userAnswers).where(eq(userAnswers.userId, userId))

    return rows.map(
      (row) =>
        new UserAnswer(
          row.id,
          row.userId,
          row.questionId,
          row.selectedOptionId ?? null,
          (row.selectedOptionIds as string[] | null) ?? null,
          row.textAnswer ?? null,
          row.createdAt,
          row.updatedAt,
        ),
    )
  }
}
