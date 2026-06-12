import {
  getRabbitMQChannel,
  FEEDBACK_QUEUE,
  MAX_RETRIES,
} from '../services/clients/rabbitmq.client'
import { generateFeedbackForUser } from '../services/feedback.service'

const startFeedbackWorker = async (): Promise<void> => {
  const channel = await getRabbitMQChannel()

  // Process one message at a time
  channel.prefetch(1)

  console.log('[feedbackWorker] Waiting for messages...')

  channel.consume(FEEDBACK_QUEUE, async (msg) => {
    if (!msg) return

    const { userId } = JSON.parse(msg.content.toString()) as { userId: string }
    const retryCount = (msg.properties.headers?.retryCount as number) ?? 0

    console.log(
      `[feedbackWorker] Processing userId=${userId} (attempt ${retryCount + 1}/${MAX_RETRIES})`,
    )

    try {
      await generateFeedbackForUser(userId)
      channel.ack(msg)
      console.log(`[feedbackWorker] Done userId=${userId}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[feedbackWorker] Failed userId=${userId}:`, errorMessage)

      if (retryCount < MAX_RETRIES - 1) {
        // Requeue with incremented retry count
        channel.nack(msg, false, false)
        channel.sendToQueue(FEEDBACK_QUEUE, msg.content, {
          persistent: true,
          headers: { retryCount: retryCount + 1 },
        })
      } else {
        // Max retries reached — send to DLQ
        console.error(`[feedbackWorker] Max retries reached for userId=${userId}, sending to DLQ`)
        channel.nack(msg, false, false)
      }
    }
  })
}

startFeedbackWorker().catch((error) => {
  console.error('[feedbackWorker] Failed to start:', error)
  process.exit(1)
})
