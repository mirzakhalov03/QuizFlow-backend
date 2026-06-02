import { getRabbitMQChannel, FEEDBACK_QUEUE } from './rabbitmq'

export const publishFeedbackJob = async (userId: string): Promise<void> => {
  const channel = await getRabbitMQChannel()

  const message = Buffer.from(JSON.stringify({ userId }))

  channel.sendToQueue(FEEDBACK_QUEUE, message, {
    persistent: true, // survive broker restart
    headers: { retryCount: 0 },
  })
}
