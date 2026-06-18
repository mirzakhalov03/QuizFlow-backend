import express from 'express'

import {
  deleteIntegration,
  getIntegration,
  getIntegrations,
} from '../controllers/integrationController'
import { generateQuizFromNotion, getNotionPages } from '../controllers/notionQuizController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import { GenerateQuizFromNotionSchema } from '../validators/quiz.schema'

const router = express.Router()

router.get('/integrations', authMiddleware, getIntegrations)
router.get('/integrations/:provider', authMiddleware, getIntegration)
router.delete('/integrations/:provider', authMiddleware, deleteIntegration)

router.get('/integrations/notion/pages', authMiddleware, getNotionPages)
router.post(
  '/quizzes/from-notion',
  authMiddleware,
  validate(GenerateQuizFromNotionSchema),
  generateQuizFromNotion,
)

export default router
