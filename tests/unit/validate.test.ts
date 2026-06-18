import { type NextFunction, type Request, type Response } from 'express'
import { describe, it, vi, beforeEach, expect } from 'vitest'
import { z } from 'zod'

import { validate } from '../../src/middlewares/validate'

describe('validate Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    mockReq = { body: {} }
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    mockNext = vi.fn() as unknown as NextFunction
  })

  it('should call next() if validation passes', () => {
    const schema = z.object({ name: z.string() })
    mockReq.body = { name: 'John' }

    validate(schema)(mockReq as Request, mockRes as Response, mockNext)

    expect(mockNext).toHaveBeenCalledTimes(1)
    expect(mockReq.body).toEqual({ name: 'John' })
  })

  it('should return 400 if validation fails', () => {
    const schema = z.object({ name: z.string() })
    mockReq.body = { name: 123 }

    validate(schema)(mockReq as Request, mockRes as Response, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(400)
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Validation failed',
      }),
    )
    expect(mockNext).not.toHaveBeenCalled()
  })
})
