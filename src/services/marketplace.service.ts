import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'

import { MarketplaceCategory } from '../constants/marketplaceCategories'
import { db } from '../database/database'
import {
  marketplaceListings,
  questions,
  quizRatings,
  quizResults,
  quizzes,
  users,
} from '../database/schema'
import { AppError } from '../helpers/AppError'

export type ListingCard = {
  quizId: string
  shareToken: string | null
  title: string
  description: string | null
  category: string
  customCategory: string | null
  difficulty: string | null
  authorName: string
  questionCount: number
  playCount: number
  ratingAvg: number
  ratingCount: number
  isMine: boolean
  listedAt: string
}

export type BrowseParams = {
  q?: string
  category?: MarketplaceCategory
  sort: 'popular' | 'recent' | 'rating'
  page: number
  pageSize: number
  userId?: string
}

// Reusable rating average expression: 0 when there are no ratings yet.
const ratingAvgExpr = sql<number>`COALESCE(${marketplaceListings.ratingSum}::float / NULLIF(${marketplaceListings.ratingCount}, 0), 0)`
// Correlated subquery for question count — avoids a GROUP BY that would fight the window count.
const questionCountExpr = sql<number>`(SELECT count(*) FROM ${questions} WHERE ${questions.quizId} = ${marketplaceListings.quizId})`

// `isMine` depends on the (optional) viewer, so the column set is built per request.
const cardColumns = (userId?: string) => ({
  quizId: marketplaceListings.quizId,
  shareToken: quizzes.shareToken,
  title: quizzes.title,
  description: marketplaceListings.description,
  category: marketplaceListings.category,
  customCategory: marketplaceListings.customCategory,
  difficulty: quizzes.difficulty,
  authorName: users.fullName,
  questionCount: questionCountExpr,
  playCount: marketplaceListings.playCount,
  ratingSum: marketplaceListings.ratingSum,
  ratingCount: marketplaceListings.ratingCount,
  isMine: userId ? sql<boolean>`(${quizzes.userId} = ${userId})` : sql<boolean>`false`,
  listedAt: marketplaceListings.listedAt,
})

type RawCard = {
  quizId: string
  shareToken: string | null
  title: string
  description: string | null
  category: string
  customCategory: string | null
  difficulty: string | null
  authorName: string
  questionCount: number
  playCount: number
  ratingSum: number
  ratingCount: number
  isMine: boolean
  listedAt: Date
}

const toCard = (r: RawCard): ListingCard => ({
  quizId: r.quizId,
  shareToken: r.shareToken,
  title: r.title,
  description: r.description,
  category: r.category,
  customCategory: r.customCategory,
  difficulty: r.difficulty,
  authorName: r.authorName,
  questionCount: Number(r.questionCount),
  playCount: r.playCount,
  ratingAvg: r.ratingCount > 0 ? Math.round((r.ratingSum / r.ratingCount) * 100) / 100 : 0,
  ratingCount: r.ratingCount,
  isMine: Boolean(r.isMine),
  listedAt: r.listedAt.toISOString(),
})

const fetchCard = async (quizId: string, userId?: string): Promise<ListingCard | null> => {
  const [row] = await db
    .select(cardColumns(userId))
    .from(marketplaceListings)
    .innerJoin(quizzes, eq(quizzes.id, marketplaceListings.quizId))
    .innerJoin(users, eq(users.id, quizzes.userId))
    .where(eq(marketplaceListings.quizId, quizId))
    .limit(1)
  return row ? toCard(row as RawCard) : null
}

const assertOwnership = async (userId: string, quizId: string): Promise<boolean> => {
  const [quiz] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
    .limit(1)
  return Boolean(quiz)
}

type PublishInput = {
  description?: string
  category: MarketplaceCategory
  customCategory?: string
}

// A custom label only makes sense for the 'other' category; null it out otherwise.
const normalizeCustomCategory = (
  category: MarketplaceCategory | undefined,
  customCategory: string | null | undefined,
): string | null => (category === 'other' ? customCategory?.trim() || null : null)

export const publishListing = async (
  userId: string,
  quizId: string,
  input: PublishInput,
): Promise<ListingCard | null> => {
  if (!(await assertOwnership(userId, quizId))) return null

  const customCategory = normalizeCustomCategory(input.category, input.customCategory)
  const description = input.description?.trim() || null

  await db.transaction(async (tx) => {
    // Ensure the quiz is publicly reachable (listing implies a share link).
    await tx
      .update(quizzes)
      .set({
        isPublic: true,
        shareToken: sql.raw('COALESCE(share_token, gen_random_uuid()::text)'),
        updatedAt: new Date(),
      })
      .where(eq(quizzes.id, quizId))

    await tx
      .insert(marketplaceListings)
      .values({
        quizId,
        description,
        category: input.category,
        customCategory,
      })
      .onConflictDoUpdate({
        target: marketplaceListings.quizId,
        set: {
          description,
          category: input.category,
          customCategory,
          updatedAt: new Date(),
        },
      })
  })

  return fetchCard(quizId, userId)
}

export const updateListing = async (
  userId: string,
  quizId: string,
  patch: {
    description?: string
    category?: MarketplaceCategory
    customCategory?: string | null
  },
): Promise<ListingCard | null> => {
  if (!(await assertOwnership(userId, quizId))) return null

  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.description !== undefined) set.description = patch.description.trim() || null
  if (patch.category !== undefined) {
    set.category = patch.category
    // Reconcile the custom label against whatever category we're moving to.
    set.customCategory = normalizeCustomCategory(patch.category, patch.customCategory)
  } else if (patch.customCategory !== undefined) {
    set.customCategory = patch.customCategory?.trim() || null
  }

  const [updated] = await db
    .update(marketplaceListings)
    .set(set)
    .where(eq(marketplaceListings.quizId, quizId))
    .returning({ id: marketplaceListings.id })

  if (!updated) return null
  return fetchCard(quizId, userId)
}

export const unpublishListing = async (userId: string, quizId: string): Promise<boolean> => {
  if (!(await assertOwnership(userId, quizId))) return false
  const deleted = await db
    .delete(marketplaceListings)
    .where(eq(marketplaceListings.quizId, quizId))
    .returning({ id: marketplaceListings.id })
  return deleted.length > 0
}

export const getListingDetail = async (
  quizId: string,
  userId?: string,
): Promise<ListingCard | null> => fetchCard(quizId, userId)

export const browseListings = async ({
  q,
  category,
  sort,
  page,
  pageSize,
  userId,
}: BrowseParams): Promise<{
  items: ListingCard[]
  page: number
  pageSize: number
  total: number
}> => {
  const offset = (page - 1) * pageSize

  const conditions = []
  if (category) conditions.push(eq(marketplaceListings.category, category))
  if (q) {
    const pattern = `%${q}%`
    conditions.push(
      or(ilike(quizzes.title, pattern), ilike(marketplaceListings.description, pattern)),
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const orderBy =
    sort === 'popular'
      ? [desc(marketplaceListings.playCount), desc(marketplaceListings.listedAt)]
      : sort === 'rating'
        ? [desc(ratingAvgExpr), desc(marketplaceListings.ratingCount)]
        : [desc(marketplaceListings.listedAt)]

  const rows = await db
    .select({ ...cardColumns(userId), total: sql<number>`count(*) OVER()` })
    .from(marketplaceListings)
    .innerJoin(quizzes, eq(quizzes.id, marketplaceListings.quizId))
    .innerJoin(users, eq(users.id, quizzes.userId))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset(offset)

  const total = rows.length > 0 ? Number((rows[0] as { total: number }).total) : 0
  const items = rows.map((r) => toCard(r as RawCard))
  return { items, page, pageSize, total }
}

export const incrementPlayCount = async (quizId: string): Promise<void> => {
  await db
    .update(marketplaceListings)
    .set({ playCount: sql`${marketplaceListings.playCount} + 1` })
    .where(eq(marketplaceListings.quizId, quizId))
}

export type ReviewItem = {
  score: number
  comment: string | null
  authorName: string
  createdAt: string
}

export const getRatings = async (
  quizId: string,
  page: number,
  pageSize: number,
): Promise<{ items: ReviewItem[]; page: number; pageSize: number; total: number }> => {
  const offset = (page - 1) * pageSize
  const rows = await db
    .select({
      score: quizRatings.score,
      comment: quizRatings.comment,
      authorName: users.fullName,
      createdAt: quizRatings.createdAt,
      total: sql<number>`count(*) OVER()`,
    })
    .from(quizRatings)
    .innerJoin(users, eq(users.id, quizRatings.userId))
    .where(eq(quizRatings.quizId, quizId))
    .orderBy(desc(quizRatings.createdAt))
    .limit(pageSize)
    .offset(offset)

  const total = rows.length > 0 ? Number(rows[0].total) : 0
  const items: ReviewItem[] = rows.map((r) => ({
    score: r.score,
    comment: r.comment,
    authorName: r.authorName,
    createdAt: r.createdAt.toISOString(),
  }))
  return { items, page, pageSize, total }
}

export const upsertRating = async (
  userId: string,
  quizId: string,
  input: { score: number; comment?: string },
): Promise<void> => {
  // You can't rate your own quiz.
  if (await assertOwnership(userId, quizId)) {
    throw new AppError('You cannot rate your own quiz', 403, 'OWN_QUIZ')
  }

  // Gate: you may only rate a quiz you've taken.
  const [taken] = await db
    .select({ id: quizResults.id })
    .from(quizResults)
    .where(and(eq(quizResults.quizId, quizId), eq(quizResults.userId, userId)))
    .limit(1)
  if (!taken) throw new AppError('You must take this quiz before rating it', 403, 'NOT_TAKEN')

  await db.transaction(async (tx) => {
    await tx
      .insert(quizRatings)
      .values({ quizId, userId, score: input.score, comment: input.comment ?? null })
      .onConflictDoUpdate({
        target: [quizRatings.quizId, quizRatings.userId],
        set: { score: input.score, comment: input.comment ?? null, updatedAt: new Date() },
      })

    // Recompute the denormalized aggregate on the listing.
    const [agg] = await tx
      .select({
        sum: sql<number>`COALESCE(sum(${quizRatings.score}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(quizRatings)
      .where(eq(quizRatings.quizId, quizId))

    await tx
      .update(marketplaceListings)
      .set({ ratingSum: Number(agg.sum), ratingCount: Number(agg.count), updatedAt: new Date() })
      .where(eq(marketplaceListings.quizId, quizId))
  })
}
