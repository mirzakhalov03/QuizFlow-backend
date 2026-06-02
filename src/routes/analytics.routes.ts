import { Router } from 'express'

import { getAnalyticsSummaryController } from '../controllers/analyticsController'
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

export default router
