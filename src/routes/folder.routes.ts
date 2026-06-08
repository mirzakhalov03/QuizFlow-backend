import express from 'express'

import * as folderController from '../controllers/folderController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = express.Router()

router.use(authMiddleware)

router.get('/folders', folderController.getFolders)
router.get('/folders/:id', folderController.getFolderById)
router.post('/folders', folderController.createFolder)
router.put('/folders/:id', folderController.updateFolder)
router.delete('/folders/:id', folderController.deleteFolder)
router.get('/folders/:id/quizzes', folderController.getQuizzesInFolder)
router.patch('/folders/quizzes/:quizId', folderController.moveQuizToFolder)
router.patch('/folders/:id/add-quizzes', folderController.addQuizzesToFolder)

export default router
