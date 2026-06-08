import cron from 'node-cron'

import { publishFeedbackJob } from '../services/feedbackProducer'
import { getEligibleUserIds } from '../services/feedbackService'

// Runs every night at 2am
const CRON_SCHEDULE = '0 2 * * *'

export const startFeedbackCron = (): void => {
  cron.schedule(CRON_SCHEDULE, async () => {
    console.log('[feedbackCron] Starting feedback job...')

    try {
      const userIds = await getEligibleUserIds()

      if (userIds.length === 0) {
        console.log('[feedbackCron] No eligible users found')
        return
      }

      console.log(`[feedbackCron] Publishing ${userIds.length} feedback jobs`)

      for (const userId of userIds) {
        await publishFeedbackJob(userId)
      }

      console.log('[feedbackCron] Done')
    } catch (error) {
      console.error('[feedbackCron] Failed:', error)
    }
  })

  console.log('[feedbackCron] Scheduled — runs nightly at 2am')
}
