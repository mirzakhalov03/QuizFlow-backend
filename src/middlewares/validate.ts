import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny } from 'zod'

const createValidator =
  (property: 'body' | 'query') =>
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[property])

    if (!result.success) {
      const flattened = result.error.flatten()
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: {
          formErrors: flattened.formErrors,
          fieldErrors: flattened.fieldErrors,
        },
      })
      return
    }

    req[property] = result.data
    next()
  }

export const validate = createValidator('body')
export const validateQuery = createValidator('query')
