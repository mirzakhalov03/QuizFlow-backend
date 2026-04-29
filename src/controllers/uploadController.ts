import type { Request, Response, NextFunction } from 'express'

import { buildS3Key, getUploadedFiles } from '../helpers/utils/uploadUtils'
import { uploadFile } from '../services/uploadFile'

export const uploadFileController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = getUploadedFiles(req)

    const uploads = await Promise.all(
      files.map((file) =>
        uploadFile(file.buffer, {
          contentType: file.mimetype,
          key: buildS3Key(file),
        }),
      ),
    )

    res.status(201).json(uploads)
  } catch (error) {
    next(error)
  }
}
