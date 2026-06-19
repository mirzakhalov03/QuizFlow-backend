import 'dotenv/config'
import { readFileSync } from 'fs'

import { Pool } from 'pg'

import { getDatabaseRejectUnauthorized } from '../helpers/utils/dbSsl'

const path = process.argv[2]
if (!path) {
  console.error('Usage: ts-node src/database/run-sql.ts <path-to-sql-file>')
  process.exit(1)
}

const sql = readFileSync(path, 'utf-8')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: getDatabaseRejectUnauthorized() }
      : false,
  max: 1,
})

pool
  .query(sql)
  .then(() => {
    console.log(`Applied ${path}`)
    return pool.end()
  })
  .catch((err) => {
    console.error('Failed:', err.message)
    pool.end()
    process.exit(1)
  })
