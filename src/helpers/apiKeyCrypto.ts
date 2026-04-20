import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

const getEncryptionKey = (): Buffer => {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET

  if (!secret) {
    throw new Error('API_KEY_ENCRYPTION_SECRET is not defined')
  }

  return createHash('sha256').update(secret).digest()
}

export const encryptApiKeyValue = (plainText: string): string => {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

export const decryptApiKeyValue = (cipherText: string): string => {
  const [ivBase64, authTagBase64, encryptedBase64] = cipherText.split(':')

  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error('Invalid encrypted API key format')
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')
  const encrypted = Buffer.from(encryptedBase64, 'base64')

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])

  return decrypted.toString('utf8')
}

export const maskApiKeyValue = (value: string): string => {
  if (value.length <= 8) {
    return '********'
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
