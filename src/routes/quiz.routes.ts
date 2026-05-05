import { Router } from 'express'

import {
  deleteQuizByIdController,
  generateQuizController,
  getJobStatusController,
  getQuizByIdController,
  getQuizzesController,
  patchQuizByIdController,
} from '../controllers/quizController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate, validateQuery } from '../middlewares/validate'
import { GenerateQuizSchema, GetQuizzesSchema, PatchQuizSchema } from '../validators/quiz.schema'

const router = Router()

/**
 * @openapi
 * /quizzes:
 *   post:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Start asynchronous quiz generation job
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QuizGenerateRequest'
 *     responses:
 *       202:
 *         description: Quiz generation started
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.post('/quizzes', authMiddleware, validate(GenerateQuizSchema), generateQuizController)

/**
 * @openapi
 * /quizzes/jobs/{jobId}:
 *   get:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Poll the status of an async quiz generation job
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Job status retrieved
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Job not found
 */
router.get('/quizzes/jobs/:jobId', authMiddleware, getJobStatusController)

/**
 * @openapi
 * /quizzes:
 *   get:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Retrieve quizzes for the authenticated user
 *     parameters:
 *       - in: query
 *         name: search
 *         description: Case-insensitive substring search on quiz title
 *         schema:
 *           type: string
 *         example: biology
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Quizzes retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiSuccessResponse'
 *       401:
 *         description: Not authenticated
 */
router.get('/quizzes', authMiddleware, validateQuery(GetQuizzesSchema), getQuizzesController)

/**
 * @openapi
 * /quizzes/{id}:
 *   get:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Retrieve quiz by id (includes questions and options)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quiz retrieved
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Quiz not found
 */
router.get('/quizzes/:id', authMiddleware, getQuizByIdController)

/**
 * @openapi
 * /quizzes/{id}:
 *   patch:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Update quiz metadata
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
 *             $ref: '#/components/schemas/QuizPatchRequest'
 *     responses:
 *       200:
 *         description: Quiz updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Quiz not found
 */
router.patch('/quizzes/:id', authMiddleware, validate(PatchQuizSchema), patchQuizByIdController)

/**
 * @openapi
 * /quizzes/{id}:
 *   delete:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Delete quiz by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quiz deleted
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Quiz not found
 */
router.delete('/quizzes/:id', authMiddleware, deleteQuizByIdController)

export default router
