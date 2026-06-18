import { Router } from 'express'

import {
  getAnalyticsSummaryController,
  getQuizHistoryController,
} from '../controllers/analyticsController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

/**
 * @openapi
 * /analytics/summary:
 *   get:
 *     tags:
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *     summary: Aggregate quiz analytics for the authenticated user
 *     responses:
 *       200:
 *         description: Analytics summary retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 *       401:
 *         description: Not authenticated
 */
router.get('/analytics/summary', authMiddleware, getAnalyticsSummaryController)

/**
 * @openapi
 * /quiz-results/history:
 *   get:
 *     tags:
 *       - Analytics
 *     security:
 *       - cookieAuth: []
 *     summary: Filterable list of the authenticated user's quiz attempts
 *     parameters:
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Restrict to quizzes inside this folder. Omit for all folders.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           enum: [5, 10, 50]
 *           default: 10
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [recent, best, worst]
 *           default: recent
 *     responses:
 *       200:
 *         description: Quiz history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Not authenticated
 */
router.get('/quiz-results/history', authMiddleware, getQuizHistoryController)

export default router
