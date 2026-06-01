import { Router } from 'express'

import {
  createByokController,
  deleteByokController,
  listByokController,
  updateByokController,
} from '../controllers/byokController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import { CreateByokSchema, UpdateByokSchema } from '../validators/byok.schema'

const router = Router()

/**
 * @openapi
 * /byok:
 *   post:
 *     tags:
 *       - BYOK
 *     security:
 *       - cookieAuth: []
 *     summary: Store a new user-provided API key (encrypted at rest)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keyName
 *               - keyValue
 *               - provider
 *             properties:
 *               keyName:
 *                 type: string
 *               keyValue:
 *                 type: string
 *               provider:
 *                 type: string
 *     responses:
 *       201:
 *         description: API key created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.post('/byok', authMiddleware, validate(CreateByokSchema), createByokController)

/**
 * @openapi
 * /byok:
 *   get:
 *     tags:
 *       - BYOK
 *     security:
 *       - cookieAuth: []
 *     summary: List the authenticated user's API keys (masked)
 *     responses:
 *       200:
 *         description: API keys retrieved
 *       401:
 *         description: Not authenticated
 */
router.get('/byok', authMiddleware, listByokController)

/**
 * @openapi
 * /byok/{id}:
 *   patch:
 *     tags:
 *       - BYOK
 *     security:
 *       - cookieAuth: []
 *     summary: Update an API key's name, value and/or provider
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keyName:
 *                 type: string
 *               keyValue:
 *                 type: string
 *               provider:
 *                 type: string
 *     responses:
 *       200:
 *         description: API key updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: API key not found
 */
router.patch('/byok/:id', authMiddleware, validate(UpdateByokSchema), updateByokController)

/**
 * @openapi
 * /byok/{id}:
 *   delete:
 *     tags:
 *       - BYOK
 *     security:
 *       - cookieAuth: []
 *     summary: Delete an API key
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: API key deleted
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: API key not found
 */
router.delete('/byok/:id', authMiddleware, deleteByokController)

export default router
