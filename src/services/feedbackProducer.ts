import { acquireFeedbackLock } from './redis'
import { sendJob } from './sqs'

export const publishFeedbackJob = async (userId: string): Promise<void> => {
  // Dedup: skip if a job for this user is already in flight
  const locked = await acquireFeedbackLock(userId)
  if (!locked) {
    console.log(`[feedbackProducer] Skipping userId=${userId} — job already in flight`)
    return
  }

  await sendJob({ userId })
}
