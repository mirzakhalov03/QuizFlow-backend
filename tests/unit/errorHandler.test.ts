import { Request, Response, NextFunction } from 'express'
import { describe, it, vi, beforeEach, expect } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import { errorHandler } from '../../src/middlewares/errorHandler'

describe('errorHandler Middleware', () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  const statusMock = vi.fn()
  const jsonMock = vi.fn()

  beforeEach(() => {
    statusMock.mockReturnThis()
    jsonMock.mockReturnThis()

    mockReq = {
      log: {
        error: vi.fn(),
      },
    } as unknown as Partial<Request>

    mockRes = {
      status: statusMock,
      json: jsonMock,
    } as unknown as Partial<Response>

    mockNext = vi.fn() as unknown as NextFunction

    process.env.NODE_ENV = 'development'

    vi.clearAllMocks()
  })

  it('should handle AppError correctly', () => {
    const error = new AppError('Custom Error', 400, 'BAD_REQUEST')

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext)

    expect(statusMock).toHaveBeenCalledWith(400)

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Custom Error',
        error: expect.objectContaining({
          code: 'BAD_REQUEST',
        }),
      }),
    )
  })

  it('should handle generic Error and return 500', () => {
    const error = new Error('Generic Error')

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext)

    expect(statusMock).toHaveBeenCalledWith(500)

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Generic Error',
      }),
    )
  })

  it('should sanitize error message in production', () => {
    process.env.NODE_ENV = 'production'

    const error = new Error('Secret Database Error')

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext)

    expect(statusMock).toHaveBeenCalledWith(500)

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Something went wrong',
      }),
    )
  })
})
