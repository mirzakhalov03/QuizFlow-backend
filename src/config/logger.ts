import winston from 'winston'

const isProduction = process.env.NODE_ENV === 'production'

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info
    const metaKeys = Object.keys(meta).filter((k) => k !== 'splat')
    const metaStr = metaKeys.length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} ${level} ${message}${metaStr}`
  }),
)

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
)

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  format: isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
})
