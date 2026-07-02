import { NextFunction, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { AuthRequest } from '../middlewares/authMiddleware'
import * as folderService from '../services/folder.service'
import {
  AddQuizzesToFolderInput,
  CreateFolderInput,
  MoveQuizToFolderInput,
  UpdateFolderInput,
  GetFoldersQuery,
  GetQuizzesInFolderQuery,
} from '../validators/folder.schema'

export const getFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { limit, offset, search } = req.query as unknown as GetFoldersQuery
    const { items, total } = await folderService.getFolders(req.user!.id, limit, offset, search)
    return res.json(
      successResponse('Folders retrieved', {
        items,
        pagination: { limit, offset, count: total },
      }),
    )
  } catch (error) {
    next(error)
  }
}

export const getFolderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const folder = await folderService.getFolderById(req.user!.id, id)
    if (!folder) {
      throw new AppError('Folder not found', 404, 'NOT_FOUND')
    }
    return res.json(successResponse('Folder retrieved', folder))
  } catch (error) {
    next(error)
  }
}

export const createFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, quizIds } = req.body as CreateFolderInput
    const folder = await folderService.createFolder(req.user!.id, name, quizIds)
    return res.json(successResponse('Folder created', folder))
  } catch (error) {
    next(error)
  }
}

export const updateFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { name } = req.body as UpdateFolderInput
    const folder = await folderService.updateFolder(req.user!.id, id, name)
    if (!folder) {
      throw new AppError('Folder not found', 404, 'NOT_FOUND')
    }
    return res.json(successResponse('Folder updated', folder))
  } catch (error) {
    next(error)
  }
}

export const deleteFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const deleted = await folderService.deleteFolder(req.user!.id, id)
    if (!deleted) {
      throw new AppError('Folder not found', 404, 'NOT_FOUND')
    }
    return res.json(successResponse('Folder deleted', null))
  } catch (error) {
    next(error)
  }
}

export const moveQuizToFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const { folderId } = req.body as MoveQuizToFolderInput
    const quiz = await folderService.moveQuizToFolder(req.user!.id, quizId, folderId)
    if (!quiz) {
      throw new AppError('Quiz or folder not found', 404, 'NOT_FOUND')
    }
    return res.json(successResponse('Quiz moved to folder', quiz))
  } catch (error) {
    next(error)
  }
}

export const getQuizzesInFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { limit, offset } = req.query as unknown as GetQuizzesInFolderQuery

    // Check if folder exists and retrieve quizzes in parallel
    const [folder, { items, total }] = await Promise.all([
      folderService.getFolderById(req.user!.id, id),
      folderService.getQuizzesInFolder(req.user!.id, id, limit, offset),
    ])

    if (!folder) {
      throw new AppError('Folder not found', 404, 'NOT_FOUND')
    }
    return res.json(
      successResponse('Quizzes in folder retrieved', {
        items,
        pagination: { limit, offset, count: total },
      }),
    )
  } catch (error) {
    next(error)
  }
}

export const addQuizzesToFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const folderId = req.params.id as string
    const { quizIds } = req.body as AddQuizzesToFolderInput

    const updated = await folderService.addQuizzesToFolder(req.user!.id, folderId, quizIds)
    if (!updated) {
      throw new AppError('Folder not found', 404, 'NOT_FOUND')
    }

    return res.json(successResponse('Quizzes added to folder', updated))
  } catch (error) {
    next(error)
  }
}
