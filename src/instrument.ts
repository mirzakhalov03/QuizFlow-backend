import dns from 'node:dns'

import * as Sentry from '@sentry/node'
import dotenv from 'dotenv'

dotenv.config()

// Prefer IPv4 for DNS resolution to mitigate intermittent "ConnectTimeoutError"
// (UND_ERR_CONNECT_TIMEOUT) in Node's fetch engine (undici).
dns.setDefaultResultOrder('ipv4first')

const dsn = process.env.SENTRY_DSN

Sentry.init({
  dsn: dsn,
  tracesSampleRate: 0.1,
})
