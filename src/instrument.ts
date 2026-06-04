import dotenv from 'dotenv'
dotenv.config()
import * as Sentry from '@sentry/node'

const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn: dsn,
  tracesSampleRate: 0.1,
})
