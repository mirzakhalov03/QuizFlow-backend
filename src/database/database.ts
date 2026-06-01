import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { getDatabaseRejectUnauthorized } from '../helpers/utils/dbSsl'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: getDatabaseRejectUnauthorized() }
      : false,
})

export const db = drizzle(pool)
