import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

/**
 * Production-safe migration runner.
 *
 * Why not `drizzle-kit migrate`?
 *   drizzle-kit's CLI migrate has no SSL config hook and does not cleanly tear
 *   down the connection to a remote host (e.g. AWS RDS), leaving the process
 *   with a non-zero exit code even on a successful no-op — which breaks CI.
 *
 * This script reuses DATABASE_URL + DATABASE_SSL (the same settings the app
 * uses), applies any pending migrations from ./drizzle, and explicitly closes
 * the pool so the process exits 0. Behaviour is identical locally and on RDS.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined')
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 1,
  })

  const db = drizzle(pool)

  console.log('Applying migrations…')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations are up to date.')

  await pool.end()
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
