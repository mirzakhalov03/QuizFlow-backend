import { Response, NextFunction } from 'express'

import { AuthRequest } from '../middlewares/authMiddleware'
import integrationService from '../services/integrationService'

export const getIntegrations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const integrations = await integrationService.getIntegrations(req.user!.id)
    return res.status(200).json(integrations)
  } catch (error) {
    next(error)
  }
}

export const getIntegration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const integration = await integrationService.getIntegration(
      req.user!.id,
      req.params.provider as string,
    )

    if (!integration) {
      return res.status(404).json({ message: 'Integration not found' })
    }

    return res.status(200).json(integration)
  } catch (error) {
    next(error)
  }
}

export const deleteIntegration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const provider = req.params.provider as string

    const deleted = await integrationService.deleteIntegration(userId, provider)

    if (!deleted) {
      return res.status(404).json({ message: 'Integration not found' })
    }

    return res.status(200).json({ message: `${provider} integration disconnected` })
  } catch (error) {
    next(error)
  }
}
