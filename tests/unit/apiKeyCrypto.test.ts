import { describe, it, beforeEach, afterEach, expect } from 'vitest'

import {
  decryptApiKeyValue,
  encryptApiKeyValue,
  maskApiKeyValue,
} from '../../src/helpers/apiKeyCrypto'

describe('apiKeyCrypto', () => {
  beforeEach(() => {
    process.env.API_KEY_ENCRYPTION_SECRET = 'test-encryption-secret'
  })

  afterEach(() => {
    process.env.API_KEY_ENCRYPTION_SECRET = 'test-encryption-secret'
  })

  describe('encrypt / decrypt round-trip', () => {
    it('should decrypt back to the original plaintext', () => {
      const plain = 'sk-test-1234567890-abcdef'

      const cipherText = encryptApiKeyValue(plain)
      expect(decryptApiKeyValue(cipherText)).toBe(plain)
    })

    it('should produce iv:authTag:data shaped ciphertext', () => {
      const cipherText = encryptApiKeyValue('secret-value')

      expect(cipherText.split(':')).toHaveLength(3)
    })

    it('should produce a different ciphertext each call but decrypt to the same value', () => {
      const plain = 'sk-deterministic-input'

      const first = encryptApiKeyValue(plain)
      const second = encryptApiKeyValue(plain)

      // Random IV per call → ciphertext differs even for identical input.
      expect(first).not.toBe(second)
      expect(decryptApiKeyValue(first)).toBe(plain)
      expect(decryptApiKeyValue(second)).toBe(plain)
    })

    it('should round-trip unicode values', () => {
      expect(decryptApiKeyValue(encryptApiKeyValue('🔑 ключ key'))).toBe('🔑 ключ key')
    })

    it('should throw when the ciphertext format is invalid', () => {
      expect(() => decryptApiKeyValue('not-a-valid-cipher')).toThrow(
        'Invalid encrypted API key format',
      )
    })

    it('should throw when the encryption secret is missing', () => {
      delete process.env.API_KEY_ENCRYPTION_SECRET
      expect(() => encryptApiKeyValue('value')).toThrow('API_KEY_ENCRYPTION_SECRET is not defined')
    })
  })

  describe('maskApiKeyValue', () => {
    it('should fully mask short values', () => {
      expect(maskApiKeyValue('short')).toBe('********')
      expect(maskApiKeyValue('12345678')).toBe('********')
    })

    it('should keep the first and last four characters for long values', () => {
      expect(maskApiKeyValue('sk-abcdef123456')).toBe('sk-a...3456')
    })
  })
})
