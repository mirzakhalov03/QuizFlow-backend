import express from 'express'

import {
  deleteIntegration,
  getIntegration,
  getIntegrations,
} from '../controllers/integrationController'
import { getNotionPages } from '../controllers/notionQuizController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = express.Router()

router.get('/integrations', authMiddleware, getIntegrations)
router.get('/integrations/:provider', authMiddleware, getIntegration)
router.delete('/integrations/:provider', authMiddleware, deleteIntegration)

router.get('/integrations/notion/pages', authMiddleware, getNotionPages)

export default router
