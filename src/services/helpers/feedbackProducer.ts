import { logger } from '../../config/logger'
import { acquireFeedbackLock } from '../clients/redis.client'
import { sendJob } from '../clients/sqs.client'

export const publishFeedbackJob = async (userId: string): Promise<void> => {
  // Dedup: skip if a job for this user is already in flight
  const locked = await acquireFeedbackLock(userId)
  if (!locked) {
    logger.info('feedbackProducer skipping — job already in flight', { userId })
    return
  }

  await sendJob({ userId })
}
