import { createClient } from 'redis'

import { logger } from '../../config/logger'

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost'
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379)

// Lock must outlive a full job lifecycle (AI call + up to 3 retries),
// then expire on its own if the worker dies without releasing it.
const LOCK_TTL_SECONDS = 60 * 60

// After a failed connect, skip further attempts for a while so a batch of
// publishes doesn't spend seconds per user retrying a dead Redis.
const CONNECT_RETRY_COOLDOWN_MS = 30_000

type RedisClient = ReturnType<typeof createClient>

let client: RedisClient | null = null
let lastConnectFailureAt = 0

const errText = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message || (err as NodeJS.ErrnoException).code || err.name
  }
  return String(err)
}

const getRedisClient = async (): Promise<RedisClient> => {
  if (client?.isReady) return client

  if (Date.now() - lastConnectFailureAt < CONNECT_RETRY_COOLDOWN_MS) {
    throw new Error('Redis recently unreachable, skipping connect attempt')
  }

  if (!client) {
    client = createClient({
      socket: {
        host: REDIS_HOST,
        port: REDIS_PORT,
        connectTimeout: 5000,
        // Give up after a few attempts so callers can fail open instead of
        // hanging on the default infinite-retry strategy.
        reconnectStrategy: (retries) => (retries >= 3 ? false : 1000),
      },
    })
    client.on('error', (err) => {
      logger.error('Redis client error', { error: errText(err) })
    })
  }

  if (!client.isOpen) {
    try {
      await client.connect()
    } catch (err) {
      lastConnectFailureAt = Date.now()
      throw err
    }
  }

  lastConnectFailureAt = 0
  return client
}

const lockKey = (userId: string): string => `feedback:lock:${userId}`

/**
 * Acquire a per-user dedup lock before publishing a feedback job.
 * Fails open: if Redis is unreachable, returns true so jobs still flow.
 */
export const acquireFeedbackLock = async (userId: string): Promise<boolean> => {
  try {
    const redis = await getRedisClient()
    const result = await redis.set(lockKey(userId), '1', { NX: true, EX: LOCK_TTL_SECONDS })
    return result === 'OK'
  } catch (err) {
    logger.warn('Redis lock acquire failed, failing open', { userId, error: errText(err) })
    return true
  }
}

/**
 * Release the dedup lock once the job reaches a terminal state
 * (success or dead-lettered after max retries).
 */
export const releaseFeedbackLock = async (userId: string): Promise<void> => {
  try {
    const redis = await getRedisClient()
    await redis.del(lockKey(userId))
  } catch (err) {
    // TTL will clean it up eventually
    logger.warn('Redis lock release failed, relying on TTL', { userId, error: errText(err) })
  }
}
