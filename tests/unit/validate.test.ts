import { expect } from 'chai'
import { type NextFunction, type Request, type Response } from 'express'
import { describe, it, vi, beforeEach } from 'vitest'
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

    expect(vi.mocked(mockNext).mock.calls.length).to.equal(1)
    expect(mockReq.body).to.deep.equal({ name: 'John' })
  })

  it('should return 400 if validation fails', () => {
    const schema = z.object({ name: z.string() })
    mockReq.body = { name: 123 }

    validate(schema)(mockReq as Request, mockRes as Response, mockNext)

    expect(vi.mocked(mockRes.status).mock.calls[0][0]).to.equal(400)
    expect(vi.mocked(mockRes.json).mock.calls[0][0]).to.have.property('success', false)
    expect(vi.mocked(mockRes.json).mock.calls[0][0]).to.have.property(
      'message',
      'Validation failed',
    )
    expect(vi.mocked(mockNext).mock.calls.length).to.equal(0)
  })
})
