import { test, expect } from '@playwright/test'

test('has health check response', async ({ request }) => {
  const response = await request.get('/health')
  expect(response.ok()).toBeTruthy()

  const body = await response.json()
  expect(body.success).toBe(true)
  expect(body.message).toBe('API is healthy')
})
