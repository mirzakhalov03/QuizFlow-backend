import 'dotenv/config'

import { type Message } from '@aws-sdk/client-sqs'

import { logger } from '../config/logger'
import { releaseFeedbackLock } from '../services/clients/redis.client'
import {
  receiveJob,
  deleteJob,
  getReceiveCount,
  MAX_RECEIVE_COUNT,
} from '../services/clients/sqs.client'
import { generateFeedbackForUser } from '../services/feedback.service'

const ERROR_BACKOFF_MS = 5000

let shuttingDown = false

const handleMessage = async (msg: Message): Promise<void> => {
  const receiveCount = getReceiveCount(msg)

  let userId: string
  try {
    const parsed = JSON.parse(msg.Body ?? '{}') as { userId?: string }
    if (!parsed.userId) throw new Error('missing userId')
    userId = parsed.userId
  } catch {
    // Poison message — leave it undeleted so SQS dead-letters it after maxReceiveCount
    logger.error('feedbackWorker malformed message, leaving for DLQ', {
      worker: 'feedbackWorker',
      messageId: msg.MessageId,
    })
    return
  }

  logger.info('feedbackWorker processing', {
    worker: 'feedbackWorker',
    userId,
    attempt: receiveCount,
    maxAttempts: MAX_RECEIVE_COUNT,
  })

  try {
    await generateFeedbackForUser(userId)
    await deleteJob(msg.ReceiptHandle!) // ack — remove so it isn't redelivered
    await releaseFeedbackLock(userId)
    logger.info('feedbackWorker done', { worker: 'feedbackWorker', userId })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('feedbackWorker failed', { worker: 'feedbackWorker', userId, error: errorMessage })

    // Not deleting the message is what triggers a retry: after the queue's
    // visibility timeout SQS makes it visible again and redelivers it.
    if (receiveCount >= MAX_RECEIVE_COUNT) {
      // Terminal — SQS will route it to the DLQ instead of redelivering.
      logger.error('feedbackWorker max attempts reached, will be dead-lettered', {
        worker: 'feedbackWorker',
        userId,
      })
      await releaseFeedbackLock(userId)
    }
    // Otherwise keep the lock so the cron won't enqueue a duplicate before the retry.
  }
}

const startFeedbackWorker = async (): Promise<void> => {
  logger.info('feedbackWorker waiting for messages', { worker: 'feedbackWorker' })

  while (!shuttingDown) {
    try {
      const msg = await receiveJob()
      if (msg) await handleMessage(msg)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('feedbackWorker receive loop error', {
        worker: 'feedbackWorker',
        error: errorMessage,
      })
      // Back off so a persistent failure (e.g. AccessDenied) doesn't spin hot
      await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS))
    }
  }

  logger.info('feedbackWorker shut down cleanly', { worker: 'feedbackWorker' })
}

const shutdown = (signal: string): void => {
  logger.info('feedbackWorker shutting down', { worker: 'feedbackWorker', signal })
  shuttingDown = true
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

startFeedbackWorker().catch((error) => {
  logger.error('feedbackWorker failed to start', {
    worker: 'feedbackWorker',
    error: error instanceof Error ? error.message : String(error),
  })
  process.exit(1)
})
