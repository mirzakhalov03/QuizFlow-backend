import 'dotenv/config'

import { type Message } from '@aws-sdk/client-sqs'

import { generateFeedbackForUser } from '../services/feedbackService'
import { releaseFeedbackLock } from '../services/redis'
import { receiveJob, deleteJob, getReceiveCount, MAX_RECEIVE_COUNT } from '../services/sqs'

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
    console.error('[feedbackWorker] Malformed message, leaving for DLQ:', msg.MessageId)
    return
  }

  console.log(
    `[feedbackWorker] Processing userId=${userId} (attempt ${receiveCount}/${MAX_RECEIVE_COUNT})`,
  )

  try {
    await generateFeedbackForUser(userId)
    await deleteJob(msg.ReceiptHandle!) // ack — remove so it isn't redelivered
    await releaseFeedbackLock(userId)
    console.log(`[feedbackWorker] Done userId=${userId}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[feedbackWorker] Failed userId=${userId}:`, errorMessage)

    // Not deleting the message is what triggers a retry: after the queue's
    // visibility timeout SQS makes it visible again and redelivers it.
    if (receiveCount >= MAX_RECEIVE_COUNT) {
      // Terminal — SQS will route it to the DLQ instead of redelivering.
      console.error(
        `[feedbackWorker] Max attempts reached for userId=${userId}, will be dead-lettered`,
      )
      await releaseFeedbackLock(userId)
    }
    // Otherwise keep the lock so the cron won't enqueue a duplicate before the retry.
  }
}

const startFeedbackWorker = async (): Promise<void> => {
  console.log('[feedbackWorker] Waiting for messages...')

  while (!shuttingDown) {
    try {
      const msg = await receiveJob()
      if (msg) await handleMessage(msg)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[feedbackWorker] Receive loop error:', errorMessage)
      // Back off so a persistent failure (e.g. AccessDenied) doesn't spin hot
      await new Promise((resolve) => setTimeout(resolve, ERROR_BACKOFF_MS))
    }
  }

  console.log('[feedbackWorker] Shut down cleanly')
}

const shutdown = (signal: string): void => {
  console.log(`[feedbackWorker] ${signal} received, finishing current poll...`)
  shuttingDown = true
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

startFeedbackWorker().catch((error) => {
  console.error('[feedbackWorker] Failed to start:', error)
  process.exit(1)
})
