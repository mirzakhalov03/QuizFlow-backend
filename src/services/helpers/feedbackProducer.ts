import { logger } from '../../config/logger'
import { acquireFeedbackLock, releaseFeedbackLock } from '../clients/redis.client'
import { sendJob } from '../clients/sqs.client'

export const publishFeedbackJob = async (userId: string): Promise<void> => {
  // Dedup: skip if a job for this user is already in flight
  const locked = await acquireFeedbackLock(userId)
  if (!locked) {
    logger.info('feedbackProducer skipping — job already in flight', { userId })
    return
  }

  try {
    await sendJob({ userId })
  } catch (err) {
    // Release the lock we just took so a publish failure doesn't block this
    // user's feedback for the full lock TTL (~1h).
    await releaseFeedbackLock(userId)
    throw err
  }
}
