import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'

dotenv.config()

const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn: dsn,
  tracesSampleRate: 0.1,
})
