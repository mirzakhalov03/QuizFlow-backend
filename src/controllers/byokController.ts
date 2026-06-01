import type { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import { AppError } from '../helpers/AppError'
import { getAuthUserId } from '../helpers/utils/authUtils'
import { createByok, deleteByok, listByok, updateByok } from '../services/byok.service'
import type { CreateByokInput, UpdateByokInput } from '../validators/byok.schema'

const getIdParam = (req: Request): string => {
  const rawId = req.params.id
  const id = typeof rawId === 'string' ? rawId : rawId?.[0]
  if (!id) {
    throw new AppError('Invalid api key id', 400, 'VALIDATION_ERROR')
  }
  return id
}

export const createByokController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const { keyName, keyValue, provider } = req.body as CreateByokInput

    const created = await createByok({ userId, keyName, keyValue, provider })

    res.status(201).json(successResponse('API key created successfully', created))
  } catch (error) {
    next(error)
  }
}

export const listByokController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)

    const items = await listByok(userId)

    res.status(200).json(successResponse('API keys retrieved successfully', { items }))
  } catch (error) {
    next(error)
  }
}

export const updateByokController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const id = getIdParam(req)
    const { keyName, keyValue, provider } = req.body as UpdateByokInput

    const updated = await updateByok(id, userId, { keyName, keyValue, provider })
    if (!updated) {
      throw new AppError('API key not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('API key updated successfully', updated))
  } catch (error) {
    next(error)
  }
}

export const deleteByokController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getAuthUserId(req)
    const id = getIdParam(req)

    const deleted = await deleteByok(id, userId)
    if (!deleted) {
      throw new AppError('API key not found', 404, 'NOT_FOUND')
    }

    res.status(200).json(successResponse('API key deleted successfully', { id }))
  } catch (error) {
    next(error)
  }
}
