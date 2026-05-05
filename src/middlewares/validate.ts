import type { NextFunction, Request, Response } from 'express'
import type { ZodTypeAny } from 'zod'

export const validate =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)

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

    req.body = result.data
    next()
  }

export const validateQuery =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query)

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

    // @ts-expect-error — Express types req.query as ParsedQs; we replace with the
    // validated plain object, which is safe because our schemas only produce strings.
    req.query = result.data
    next()
  }
