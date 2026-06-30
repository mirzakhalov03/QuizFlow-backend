import { NextFunction, Request, Response } from 'express'

import { successResponse } from '../helpers/apiResponse'
import * as contactService from '../services/contact.service'
import { ContactMessageInput } from '../validators/contact.schema'

export const submitContactMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await contactService.sendContactMessage(req.body as ContactMessageInput)
    return res.json(successResponse('Message sent', null))
  } catch (error) {
    next(error)
  }
}
