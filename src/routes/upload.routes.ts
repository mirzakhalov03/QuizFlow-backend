import { Router } from 'express'

import { uploadFileController } from '../controllers/uploadController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { upload } from '../middlewares/multerUpload'

const router = Router()

/**
 * @openapi
 * /upload-file:
 *   post:
 *     tags:
 *       - Upload
 *     summary: Upload one or more files to S3
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
