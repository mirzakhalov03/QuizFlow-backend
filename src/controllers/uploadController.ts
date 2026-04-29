import type { Request, Response, NextFunction } from 'express'

import { buildS3Key, getFirstUploadedFile } from '../helpers/utils/uploadUtils'
import { uploadFile } from '../services/uploadFile'

export const uploadFileController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = getFirstUploadedFile(req)

    const { key, url } = await uploadFile(file.buffer, {
      contentType: file.mimetype,
      key: buildS3Key(file),
    })

    res.status(201).json({ key, url })
  } catch (error) {
    next(error)
  }
}
