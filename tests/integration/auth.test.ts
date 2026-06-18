import request from 'supertest'
import { describe, it, vi, beforeEach, expect } from 'vitest'

import app from '../../src/app'
import { AppError } from '../../src/helpers/AppError'
import authService from '../../src/services/auth.service'

vi.mock('../../src/services/auth.service')

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /auth/refresh', () => {
    it('should return 200 and refresh token when valid cookie is provided', async () => {
      vi.mocked(authService.refreshAccessToken).mockResolvedValue('new-access-token')

      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', ['refreshToken=valid-token'])

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('Token refreshed')

      const cookies = response.get('Set-Cookie') || []
      expect(cookies.some((c) => c.includes('accessToken'))).toBe(true)
    })

    it('should return 401 when service throws error', async () => {
      vi.mocked(authService.refreshAccessToken).mockRejectedValue(
        new AppError('Invalid token', 401),
      )

      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', ['refreshToken=invalid-token'])

      expect(response.status).toBe(401)
    })
  })

  describe('POST /auth/logout', () => {
    it('should clear cookies and redirect to frontend', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Cookie', ['refreshToken=some-token'])

      expect(response.status).toBe(302)
      expect(response.header.location).toContain('http://localhost:5173')

      const cookies = response.get('Set-Cookie') || []
      expect(cookies.some((c) => c.includes('refreshToken=;'))).toBe(true)
      expect(cookies.some((c) => c.includes('accessToken=;'))).toBe(true)
    })
  })
})
