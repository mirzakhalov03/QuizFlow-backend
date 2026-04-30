import { Router } from 'express'

import {
  deleteQuizByIdController,
  generateQuizController,
  getQuizByIdController,
  getQuizzesController,
  patchQuizByIdController,
} from '../controllers/quizController'

const router = Router()

/**
 * @openapi
 * /quizzes/generate:
 *   post:
 *     tags:
 *       - Quiz
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
 */
router.post('/quizzes/generate', generateQuizController)

/**
 * @openapi
 * /quizzes:
 *   get:
 *     tags:
 *       - Quiz
 *     summary: Retrieve quizzes
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
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
 */
router.get('/quizzes', getQuizzesController)

/**
 * @openapi
 * /quizzes/{id}:
 *   get:
 *     tags:
 *       - Quiz
 *     summary: Retrieve quiz by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quiz retrieved
 *       404:
 *         description: Quiz not found
 */
router.get('/quizzes/:id', getQuizByIdController)

/**
 * @openapi
 * /quizzes/{id}:
 *   patch:
 *     tags:
 *       - Quiz
 *     summary: Update quiz metadata
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: userId
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
 *       404:
 *         description: Quiz not found
 */
router.patch('/quizzes/:id', patchQuizByIdController)

/**
 * @openapi
 * /quizzes/{id}:
 *   delete:
 *     tags:
 *       - Quiz
 *     summary: Delete quiz by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quiz deleted
 *       404:
 *         description: Quiz not found
 */
router.delete('/quizzes/:id', deleteQuizByIdController)

export default router
