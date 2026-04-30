import { Router } from 'express'

import { successResponse } from '../helpers/apiResponse'

const router = Router()

/**
 * @openapi
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Health check endpoint
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 */
router.get('/health', (_req, res) => {
  res.status(200).json(successResponse('API is healthy', { uptime: process.uptime() }))
})

export default router
