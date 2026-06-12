import type { Logger } from 'winston'

export type UserPayload = {
  googleId: string
  email: string
  name: string
}

declare global {
  namespace Express {
    interface Request {
      log: Logger
      requestId: string
    }
  }
}
