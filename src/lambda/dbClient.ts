import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

import * as schema from '../database/schema'

/**
 * Lambda-local database client using a single pg.Client (not Pool).
 *
 * Why not Pool?
 *   pg.Pool holds multiple open connections. Under Lambda concurrency,
 *   each execution environment opens its own pool, quickly exhausting
 *   Postgres max_connections. A single Client reuses one connection per
 *   warm Lambda instance and is the correct pattern for serverless.
 *
 * The singleton is module-level so it persists across warm invocations
 * within the same execution environment — avoiding reconnect overhead.
 */

type DrizzleDb = NodePgDatabase<typeof schema>

let _db: DrizzleDb | null = null
let _client: Client | null = null

export const getLambdaDb = async (): Promise<DrizzleDb> => {
  if (_db) return _db

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined')
  }

  _client = new Client({ connectionString })
  await _client.connect()

  _db = drizzle(_client, { schema })

  // Attempt clean teardown if the Lambda container is shutting down
  // (best-effort — Lambda may SIGKILL before this fires)
  process.on('SIGTERM', async () => {
    if (_client) {
      await _client.end().catch(() => {})
    }
  })

  return _db
}
