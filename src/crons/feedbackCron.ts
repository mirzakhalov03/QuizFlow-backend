import cron from 'node-cron'

import { logger } from '../config/logger'
import { getEligibleUserIds } from '../services/feedback.service'
import { publishFeedbackJob } from '../services/helpers/feedbackProducer'

// Runs every night at 2am
const CRON_SCHEDULE = '0 2 * * *'

export const startFeedbackCron = (): void => {
  cron.schedule(CRON_SCHEDULE, async () => {
    logger.info('feedbackCron starting', { job: 'feedbackCron' })

    try {
      const userIds = await getEligibleUserIds()

      if (userIds.length === 0) {
        logger.info('feedbackCron: no eligible users', { job: 'feedbackCron' })
        return
      }

      logger.info('feedbackCron publishing jobs', { job: 'feedbackCron', count: userIds.length })

      for (const userId of userIds) {
        await publishFeedbackJob(userId)
      }

      logger.info('feedbackCron done', { job: 'feedbackCron' })
    } catch (error) {
      logger.error('feedbackCron failed', {
        job: 'feedbackCron',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  logger.info('feedbackCron scheduled (nightly 2am)', { job: 'feedbackCron' })
}
