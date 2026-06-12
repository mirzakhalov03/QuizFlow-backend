import { logger } from '../config/logger'
import {
  getRabbitMQChannel,
  FEEDBACK_QUEUE,
  FEEDBACK_DLQ,
  MAX_RETRIES,
} from '../services/clients/rabbitmq.client'
import { generateFeedbackForUser } from '../services/feedback.service'

const startFeedbackWorker = async (): Promise<void> => {
  const channel = await getRabbitMQChannel()

  // Process one message at a time
  channel.prefetch(1)

  logger.info('feedbackWorker waiting for messages', { worker: 'feedbackWorker' })

  channel.consume(FEEDBACK_QUEUE, async (msg) => {
    if (!msg) return

    const { userId } = JSON.parse(msg.content.toString()) as { userId: string }
    const retryCount = (msg.properties.headers?.retryCount as number) ?? 0

    logger.info('feedbackWorker processing', {
      worker: 'feedbackWorker',
      userId,
      attempt: retryCount + 1,
      maxRetries: MAX_RETRIES,
    })

    try {
      await generateFeedbackForUser(userId)
      channel.ack(msg)
      logger.info('feedbackWorker done', { worker: 'feedbackWorker', userId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('feedbackWorker failed', {
        worker: 'feedbackWorker',
        userId,
        error: errorMessage,
      })

      if (retryCount < MAX_RETRIES - 1) {
        // Requeue with incremented retry count
        channel.nack(msg, false, false)
        channel.sendToQueue(FEEDBACK_QUEUE, msg.content, {
          persistent: true,
          headers: { retryCount: retryCount + 1 },
        })
      } else {
        // Max retries reached — send to DLQ
        logger.error('feedbackWorker max retries, sending to DLQ', {
          worker: 'feedbackWorker',
          userId,
        })
        channel.nack(msg, false, false)
      }
    }
  })
}

startFeedbackWorker().catch((error) => {
  logger.error('feedbackWorker failed to start', {
    worker: 'feedbackWorker',
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
