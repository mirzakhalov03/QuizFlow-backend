import express from 'express'

import * as folderController from '../controllers/folderController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { validate } from '../middlewares/validate'
import {
  AddQuizzesToFolderSchema,
  CreateFolderSchema,
  MoveQuizToFolderSchema,
  UpdateFolderSchema,
} from '../validators/folder.schema'

const router = express.Router()

router.use(authMiddleware)

router.get('/folders', folderController.getFolders)
router.get('/folders/:id', folderController.getFolderById)
router.post('/folders', validate(CreateFolderSchema), folderController.createFolder)
router.patch('/folders/:id', validate(UpdateFolderSchema), folderController.updateFolder)
router.delete('/folders/:id', folderController.deleteFolder)
router.get('/folders/:id/quizzes', folderController.getQuizzesInFolder)
router.patch(
  '/folders/quizzes/:quizId',
  validate(MoveQuizToFolderSchema),
  folderController.moveQuizToFolder,
)
router.patch(
  '/folders/:id/add-quizzes',
  validate(AddQuizzesToFolderSchema),
  folderController.addQuizzesToFolder,
)

export default router
