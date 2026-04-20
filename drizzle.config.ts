import 'dotenv/config'

import { defineConfig } from 'drizzle-kit'

declare const process: {
  env: {
    DATABASE_URL?: string
  }
}

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
