import { NextFunction, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AuthRequest } from '../middlewares/authMiddleware'
import * as folderService from '../services/folder.service'

export const getFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const folders = await folderService.getFolders(req.user!.id)
    return res.json(successResponse('Folders retrieved', folders))
  } catch (error) {
    next(error)
  }
}

export const getFolderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const folder = await folderService.getFolderById(req.user!.id, id)
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' })
    }
    return res.json(successResponse('Folder retrieved', folder))
  } catch (error) {
    next(error)
  }
}

export const createFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, quizIds } = req.body as { name: string; quizIds?: string[] }
    const folder = await folderService.createFolder(req.user!.id, name, quizIds)
    return res.json(successResponse('Folder created', folder))
  } catch (error) {
    next(error)
  }
}

export const updateFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { name } = req.body as { name: string }
    const folder = await folderService.updateFolder(req.user!.id, id, name)
    return res.json(successResponse('Folder updated', folder))
  } catch (error) {
    next(error)
  }
}

export const deleteFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    await folderService.deleteFolder(req.user!.id, id)
    return res.json(successResponse('Folder deleted', null))
  } catch (error) {
    next(error)
  }
}

export const moveQuizToFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const quizId = req.params.quizId as string
    const { folderId } = req.body as { folderId: string | null }
    const quiz = await folderService.moveQuizToFolder(req.user!.id, quizId, folderId)
    return res.json(successResponse('Quiz moved to folder', quiz))
  } catch (error) {
    next(error)
  }
}

export const getQuizzesInFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const quizzes = await folderService.getQuizzesInFolder(req.user!.id, id)
    return res.json(successResponse('Quizzes in folder retrieved', quizzes))
  } catch (error) {
    next(error)
  }
}

export const addQuizzesToFolder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const folderId = req.params.id as string
    const { quizIds } = req.body as { quizIds: string[] }

    if (!Array.isArray(quizIds)) {
      return res.status(400).json({ message: 'quizIds must be an array' })
    }

    const updated = await folderService.addQuizzesToFolder(req.user!.id, folderId, quizIds)
    if (!updated) {
      return res.status(404).json({ message: 'Folder not found' })
    }

    return res.json(successResponse('Quizzes added to folder', updated))
  } catch (error) {
    next(error)
  }
}
