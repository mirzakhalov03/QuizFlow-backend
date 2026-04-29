import { Router } from 'express'

import { uploadFileController } from '../controllers/uploadController'
import { upload } from '../middlewares/multerUpload'

const router = Router()

router.post('/upload-file', upload.array('file', 10), uploadFileController)

export default router
