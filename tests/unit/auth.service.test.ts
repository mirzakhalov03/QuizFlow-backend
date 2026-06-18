import { expect } from 'chai'
import jwt from 'jsonwebtoken'
import { describe, it, vi, beforeEach } from 'vitest'

import { AppError } from '../../src/helpers/AppError'
import User from '../../src/models/user.model'
import authService from '../../src/services/auth.service'

vi.mock('../../src/services/user.service')
vi.mock('../../src/services/profile.service')
vi.mock('../../src/services/integration.service')
vi.mock('../../src/models/user.model')
vi.mock('../../src/database/database', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}))

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret'
    process.env.ACCESS_TOKEN_SECRET = 'test-access-secret'
  })

  describe('refreshAccessToken', () => {
    it('should throw error if no refreshToken provided', async () => {
      try {
        await authService.refreshAccessToken('')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect((error as Error).message).to.equal('No refresh token')
      }
    })

    it('should throw AppError if user not found', async () => {
      const token = jwt.sign({ id: 'user-1' }, 'test-refresh-secret')
      vi.mocked(User.findById).mockResolvedValue(null)

      try {
        await authService.refreshAccessToken(token)
        expect.fail('Should have thrown AppError')
      } catch (error) {
        expect(error).to.be.instanceOf(AppError)
      }
    })

    it('should throw AppError if refreshToken does not match', async () => {
      const token = jwt.sign({ id: 'user-1' }, 'test-refresh-secret')
      const mockUser = { id: 'user-1', refreshToken: 'different-token' }
      vi.mocked(User.findById).mockResolvedValue(mockUser as unknown as User)

      try {
        await authService.refreshAccessToken(token)
        expect.fail('Should have thrown AppError')
      } catch (error) {
        expect(error).to.be.instanceOf(AppError)
      }
    })

    it('should return new accessToken if valid', async () => {
      const token = jwt.sign({ id: 'user-1' }, 'test-refresh-secret')
      const mockUser = { id: 'user-1', refreshToken: token }
      vi.mocked(User.findById).mockResolvedValue(mockUser as unknown as User)

      const accessToken = await authService.refreshAccessToken(token)
      expect(accessToken).to.be.a('string')
    })
  })
})
