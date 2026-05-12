const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
require('dotenv').config()

const migrationFiles = [
  '0000_noisy_bruce_banner.sql',
  '0001_melodic_cargill.sql',
  '0002_next_talisman.sql',
  '0003_minor_spacker_dave.sql',
  '0004_dark_wild_pack.sql',
  '0005_thin_peter_quill.sql',
  '0006_aspiring_luke_cage.sql',
]

const sslEnabled = (process.env.DATABASE_SSL ?? 'true').toLowerCase() === 'true'

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
})

const applyMigrations = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set')
  }

  await client.connect()

  for (const fileName of migrationFiles) {
    const filePath = path.join(__dirname, '..', 'drizzle', fileName)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${fileName}`)
    }

    const sql = fs.readFileSync(filePath, 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)

    for (const statement of statements) {
      await client.query(statement)
    }

    console.log(`Applied ${fileName}`)
  }

  await client.end()
}

applyMigrations().catch(async (error) => {
  console.error('Migration failed:', error)
  try {
    await client.end()
  } catch {
    // ignore cleanup errors
  }
  process.exit(1)
})
