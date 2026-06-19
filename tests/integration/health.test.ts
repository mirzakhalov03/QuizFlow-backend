import request from 'supertest'
import { describe, it, expect } from 'vitest'

import app from '../../src/app'

describe('Health Integration Test', () => {
  it('GET /health should return 200 and healthy status', async () => {
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.message).toBe('API is healthy')
    expect(response.body.data).toHaveProperty('uptime')
  })
})
