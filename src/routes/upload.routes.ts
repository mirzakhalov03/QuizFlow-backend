import { Router } from 'express'

import { getPresignedUrlController, uploadFileController } from '../controllers/uploadController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { upload } from '../middlewares/multerUpload'
import { validateQuery } from '../middlewares/validate'
import { PresignedUrlSchema } from '../validators/upload.schema'

const router = Router()

/**
 * @openapi
 * /upload/presigned-url:
 *   get:
 *     tags:
 *       - Upload
 *     summary: Get a pre-signed S3 URL to upload a file directly from the client
 *     description: |
 *       Returns a short-lived (5 min) PUT URL. The client uploads the file directly
 *       to S3 — the file never touches this server. After upload, pass the returned
 *       `key` to `POST /quizzes`.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         example: lecture-notes.pdf
 *       - in: query
 *         name: contentType
 *         required: true
 *         schema:
 *           type: string
 *         example: application/pdf
 *     responses:
 *       201:
 *         description: Pre-signed URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                       description: S3 key — pass to POST /quizzes
 *                     uploadUrl:
 *                       type: string
 *                       description: Pre-signed PUT URL — use this to upload directly to S3
 *                     objectUrl:
 *                       type: string
 *                       description: Final S3 object URL (available after upload completes)
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Missing or invalid query params
 *       401:
 *         description: Not authenticated
 *       415:
 *         description: Unsupported file type
 */
router.get(
  '/upload/presigned-url',
  authMiddleware,
  validateQuery(PresignedUrlSchema),
  getPresignedUrlController,
)

/**
 * @openapi
 * /upload-file:
 *   post:
 *     tags:
 *       - Upload
 *     summary: "[Deprecated] Upload files via server — prefer GET /upload/presigned-url"
 *     description: |
 *       Accepts multipart/form-data and proxies the file through the server to S3.
 *       Kept for backward compatibility. Use `GET /upload/presigned-url` for new integrations.
 *     deprecated: true
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Files uploaded successfully
 *       400:
 *         description: Validation or upload error
 *       401:
 *         description: Not authenticated
 *       415:
 *         description: Unsupported file type
 */
router.post('/upload-file', authMiddleware, upload.array('file', 10), uploadFileController)

export default router
