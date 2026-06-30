import express from 'express'

import * as contactController from '../controllers/contactController'
import { contactLimiter } from '../middlewares/rateLimit'
import { validate } from '../middlewares/validate'
import { ContactMessageSchema } from '../validators/contact.schema'

const router = express.Router()

/**
 * @openapi
 * /contact:
 *   post:
 *     tags:
 *       - Contact
 *     summary: Send a message via the public contact form
 *     responses:
 *       200:
 *         description: Message sent
 */
router.post(
  '/contact',
  contactLimiter,
  validate(ContactMessageSchema),
  contactController.submitContactMessage,
)

export default router
