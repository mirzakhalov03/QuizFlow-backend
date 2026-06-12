import amqplib, { type Channel } from 'amqplib'

import { logger } from '../../config/logger'

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'
const RECONNECT_DELAY_MS = 5000

export const FEEDBACK_QUEUE = 'feedback'
export const FEEDBACK_DLQ = 'feedback.dlq'
export const MAX_RETRIES = 3

let connection: Awaited<ReturnType<typeof amqplib.connect>> | null = null
let channel: Channel | null = null
let isReconnecting = false

const setupQueues = async (ch: Channel): Promise<void> => {
  await ch.assertQueue(FEEDBACK_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': FEEDBACK_DLQ,
    },
  })

  await ch.assertQueue(FEEDBACK_DLQ, { durable: true })
}

const connect = async (): Promise<void> => {
  connection = await amqplib.connect(RABBITMQ_URL)
  channel = await connection.createChannel()

  await setupQueues(channel)

  connection.on('error', (err) => {
    logger.error('RabbitMQ connection error', { error: err.message })
    scheduleReconnect()
  })

  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed, reconnecting')
    scheduleReconnect()
  })

  logger.info('RabbitMQ connected')
}

const scheduleReconnect = (): void => {
  if (isReconnecting) return
  isReconnecting = true
  channel = null
  connection = null

  setTimeout(async () => {
    logger.info('RabbitMQ attempting to reconnect')
    try {
      await connect()
      isReconnecting = false
    } catch (err) {
      logger.error('RabbitMQ reconnect failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      isReconnecting = false
      scheduleReconnect()
    }
  }, RECONNECT_DELAY_MS)
}

export const getRabbitMQChannel = async (): Promise<Channel> => {
  if (channel) return channel
  await connect()
  return channel!
}
