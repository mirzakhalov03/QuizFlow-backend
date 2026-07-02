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
let connectPromise: Promise<RedisClient> | null = null
let lastConnectFailureAt = 0

const errText = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message || (err as NodeJS.ErrnoException).code || err.name
  }
  return String(err)
}

const getRedisClient = async (): Promise<RedisClient> => {
  if (client?.isReady) return client
  // Coalesce concurrent callers onto a single in-flight connect so we never
  // call connect() twice on the same client ('Socket already opened').
  if (connectPromise) return connectPromise

  if (Date.now() - lastConnectFailureAt < CONNECT_RETRY_COOLDOWN_MS) {
    throw new Error('Redis recently unreachable, skipping connect attempt')
  }

  connectPromise = (async () => {
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
  })()

  try {
    return await connectPromise
  } finally {
    connectPromise = null
  }
}

/**
 * Read a JSON-serialized value from the cache. Fails open: on a miss, a parse
 * error, or an unreachable Redis, returns null so callers recompute from source.
 */
export const cacheGetJson = async <T>(key: string): Promise<T | null> => {
  try {
    const redis = await getRedisClient()
    const raw = await redis.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch (err) {
      // Corrupt entry: evict it so we don't recompute + warn on every read until TTL.
      await redis.del(key).catch(() => {})
      logger.warn('Redis cache contained invalid JSON, evicting and falling back to source', {
        key,
        error: errText(err),
      })
      return null
    }
  } catch (err) {
    logger.warn('Redis cache read failed, falling back to source', { key, error: errText(err) })
    return null
  }
}

/** Write a JSON-serialized value with a TTL. Fails open — a write miss just means a later recompute. */
export const cacheSetJson = async (
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> => {
  // Redis EX requires a positive integer; skip rather than let a misconfigured TTL
  // throw and warn on every write.
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    logger.warn('Redis cache write skipped due to invalid TTL', { key, ttlSeconds })
    return
  }
  try {
    const redis = await getRedisClient()
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds })
  } catch (err) {
    logger.warn('Redis cache write failed', { key, error: errText(err) })
  }
}

/** Delete a cached key so the next read recomputes. Fails open — TTL is the backstop. */
export const cacheDel = async (key: string): Promise<void> => {
  try {
    const redis = await getRedisClient()
    await redis.del(key)
  } catch (err) {
    logger.warn('Redis cache delete failed, relying on TTL', { key, error: errText(err) })
  }
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
