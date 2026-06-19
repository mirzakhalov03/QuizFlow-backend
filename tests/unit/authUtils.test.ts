import { expect } from 'chai'
import { Request } from 'express'
import { describe, it } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import { getAuthUserId } from '../../src/helpers/utils/authUtils'

describe('authUtils', () => {
  describe('getAuthUserId', () => {
    it('should return userId when authenticated', () => {
      const mockReq = {
        user: { id: 'user-123' },
      }

      const result = getAuthUserId(mockReq as unknown as Request)
      expect(result).to.equal('user-123')
    })

    it('should throw AppError when not authenticated', () => {
      const mockReq = {}

      expect(() => getAuthUserId(mockReq as unknown as Request)).to.throw(
        AppError,
        'Not authenticated',
      )
    })
  })
})
