import { Router } from 'express'

import {
  cloneSharedQuizController,
  deleteQuizByIdController,
  disableSharingController,
  enableSharingController,
  exportQuizPdfController,
  generateQuizController,
  getJobStatusController,
  getPublicQuizController,
  getQuizByIdController,
  getQuizResultController,
  getQuizzesController,
  patchQuizByIdController,
  submitPublicQuizController,
  submitQuizController,
} from '../controllers/quizController'
import { authMiddleware, optionalAuthMiddleware } from '../middlewares/authMiddleware'
import { publicSubmitLimiter, quizGenerationLimiter } from '../middlewares/rateLimit'
import { validate, validateQuery } from '../middlewares/validate'
import {
  GenerateQuizSchema,
  GenerateQuizSourceSchema,
  GetQuizzesSchema,
  PatchQuizSchema,
  PublicSubmitSchema,
  SubmitQuizSchema,
} from '../validators/quiz.schema'

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
router.post(
  '/quizzes',
  authMiddleware,
  quizGenerationLimiter,
  validateQuery(GenerateQuizSourceSchema),
  validate(GenerateQuizSchema),
  generateQuizController,
)

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
 *       - in: query
 *         name: types
 *         description: >
 *           Filter by question type. Repeat the param or pass a comma-separated
 *           list (e.g. types=open_ended,true_false).
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [multiple_choice, multi_select, open_ended, true_false]
 *         style: form
 *         explode: true
 *       - in: query
 *         name: sort
 *         description: Sort by creation date.
 *         schema:
 *           type: string
 *           enum: [newest, oldest]
 *           default: newest
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
 * /quizzes/{id}/pdf:
 *   get:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Export a quiz as a printable PDF (rendered with Puppeteer)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Quiz not found
 */
router.get('/quizzes/:id/pdf', authMiddleware, exportQuizPdfController)

/**
 * @openapi
 * /public/quizzes/{shareToken}:
 *  get:
 *    tags:
 *      - Quiz
 *    summary: Retrieve a public quiz by its share token
 *    parameters:
 *      - in: path
 *        name: shareToken
 *        required: true
 *        schema:
 *          type: string
 *          format: uuid
 *    responses:
 *      200:
 *        description: Public quiz retrieved (without answers)
 *      404:
 *        description: Quiz not found or not public
 */
router.get('/public/quizzes/:shareToken', optionalAuthMiddleware, getPublicQuizController)

/**
 * @openapi
 * /public/quizzes/{shareToken}/submit:
 *   post:
 *     tags: [Quiz]
 *     summary: Submit answers to a public quiz and get an ephemeral score (no auth)
 */
router.post(
  '/public/quizzes/:shareToken/submit',
  optionalAuthMiddleware,
  publicSubmitLimiter,
  validate(PublicSubmitSchema),
  submitPublicQuizController,
)

/**
 * @openapi
 * /quizzes/{shareToken}/clone:
 *   post:
 *     tags: [Quiz]
 *     security: [{ cookieAuth: [] }]
 *     summary: Clone a public quiz into the authenticated user's library
 */
router.post('/quizzes/:shareToken/clone', authMiddleware, cloneSharedQuizController)
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
 * /quizzes/{id}/share/enable:
 *   patch:
 *     tags: [Quiz]
 *     security: [{ cookieAuth: [] }]
 *     summary: Enable public sharing for a quiz
 */
router.patch('/quizzes/:id/share/enable', authMiddleware, enableSharingController)

/**
 * @openapi
 * /quizzes/{id}/share/disable:
 *   patch:
 *     tags: [Quiz]
 *     security: [{ cookieAuth: [] }]
 *     summary: Disable public sharing for a quiz
 */
router.patch('/quizzes/:id/share/disable', authMiddleware, disableSharingController)

/**
 * @openapi
 * /quizzes/{id}/submit:
 *   post:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Submit answers for a quiz and receive the calculated result
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
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - questionId
 *                   properties:
 *                     questionId:
 *                       type: string
 *                       format: uuid
 *                     selectedOptionId:
 *                       type: string
 *                       format: uuid
 *                     textAnswer:
 *                       type: string
 *     responses:
 *       200:
 *         description: Quiz submitted, result returned
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Quiz not found
 */
router.post('/quizzes/:id/submit', authMiddleware, validate(SubmitQuizSchema), submitQuizController)

/**
 * @openapi
 * /quizzes/{id}/result:
 *   get:
 *     tags:
 *       - Quiz
 *     security:
 *       - cookieAuth: []
 *     summary: Get a quiz result with open-ended grading status and per-answer verdicts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Result with grading status and verdicts
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Result not found
 */
router.get('/quizzes/:id/result', authMiddleware, getQuizResultController)

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
