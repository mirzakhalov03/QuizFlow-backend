import { Router } from 'express'

import {
  addBookmarkController,
  getBookmarksController,
  removeBookmarkController,
} from '../controllers/bookmarkController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validateQuery } from '../middlewares/validate'
import { GetBookmarksSchema } from '../validators/bookmark.schema'

const router = Router()

/**
 * @openapi
 * /questions/{questionId}/bookmark:
 *   post:
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *     summary: Bookmark a question
 *     description: |
 *       Bookmarks a question that belongs to a quiz in the authenticated user's
 *       library (own-generated or marketplace-imported). Returns 403 if the
 *       question is from a public quiz the user has not imported.
 *     parameters:
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Question bookmarked successfully
 *       403:
 *         description: Question is not in your library — import the quiz first
 *       409:
 *         description: Question is already bookmarked
 */
router.post('/questions/:questionId/bookmark', authMiddleware, addBookmarkController)

/**
 * @openapi
 * /questions/{questionId}/bookmark:
 *   delete:
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *     summary: Remove a bookmark
 *     parameters:
 *       - in: path
 *         name: questionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Bookmark removed
 *       404:
 *         description: Bookmark not found
 */
router.delete('/questions/:questionId/bookmark', authMiddleware, removeBookmarkController)

/**
 * @openapi
 * /bookmarks:
 *   get:
 *     tags:
 *       - Bookmarks
 *     security:
 *       - cookieAuth: []
 *     summary: List all bookmarked questions with answers embedded
 *     description: |
 *       Returns all bookmarked questions for the authenticated user.
 *       Each item includes the correct answer already embedded:
 *       - `correctOptions` (id, text, explanation) for choice-based questions
 *         (multiple_choice, multi_select, true_false).
 *       - `modelAnswer` for open_ended questions (the AI-generated suggested
 *         answer); `correctOptions` will be an empty array for these.
 *       No follow-up request is required to reveal the answer on the client.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 200
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *     responses:
 *       200:
 *         description: List of bookmarked questions with embedded answers
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 *       401:
 *         description: Not authenticated
 */
router.get('/bookmarks', authMiddleware, validateQuery(GetBookmarksSchema), getBookmarksController)

export default router
