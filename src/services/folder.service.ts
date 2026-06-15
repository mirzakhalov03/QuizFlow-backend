import { and, eq, sql, inArray } from 'drizzle-orm'

import { db } from '../database/database'
import { folders, quizzes } from '../database/schema'

export const getFolders = async (userId: string) => {
  const userFolders = await db
    .select({
      id: folders.id,
      name: folders.name,
      createdAt: folders.createdAt,
      updatedAt: folders.updatedAt,
      quizCount: sql<number>`count(${quizzes.id})`.as('quizCount'),
    })
    .from(folders)
    .leftJoin(quizzes, eq(quizzes.folderId, folders.id))
    .where(eq(folders.userId, userId))
    .groupBy(folders.id)
    .orderBy(folders.name)

  return userFolders
}

export const getFolderById = async (userId: string, folderId: string) => {
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1)

  return folder
}

export const createFolder = async (userId: string, name: string, quizIds?: string[]) => {
  return db.transaction(async (tx) => {
    const [folder] = await tx
      .insert(folders)
      .values({
        userId,
        name,
      })
      .returning()

    if (quizIds && quizIds.length > 0) {
      await tx
        .update(quizzes)
        .set({ folderId: folder.id, updatedAt: new Date() })
        .where(and(eq(quizzes.userId, userId), inArray(quizzes.id, quizIds)))
    }

    return folder
  })
}

export const updateFolder = async (userId: string, folderId: string, name: string) => {
  const [folder] = await db
    .update(folders)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning()

  return folder
}

export const deleteFolder = async (userId: string, folderId: string) => {
  // quizzes with this folderId will have it set to null due to onDelete: 'set null'
  const [deletedFolder] = await db
    .delete(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning()

  return deletedFolder
}

export const moveQuizToFolder = async (userId: string, quizId: string, folderId: string | null) => {
  if (folderId) {
    // Verify folder belongs to user
    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .limit(1)

    if (!folder) return null
  }

  const [updatedQuiz] = await db
    .update(quizzes)
    .set({ folderId, updatedAt: new Date() })
    .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
    .returning()

  return updatedQuiz
}

export const getQuizzesInFolder = async (userId: string, folderId: string) => {
  const folderQuizzes = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.userId, userId), eq(quizzes.folderId, folderId)))
    .orderBy(quizzes.createdAt)

  return folderQuizzes
}

export const addQuizzesToFolder = async (userId: string, folderId: string, quizIds: string[]) => {
  if (!quizIds.length) return []

  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .limit(1)

  if (!folder) return null

  const updatedQuizzes = await db
    .update(quizzes)
    .set({ folderId, updatedAt: new Date() })
    .where(and(eq(quizzes.userId, userId), inArray(quizzes.id, quizIds)))
    .returning()

  return updatedQuizzes
}
