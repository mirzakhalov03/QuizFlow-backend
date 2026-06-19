import 'dotenv/config'

import { getEligibleUserIds } from '../src/services/feedback.service'
import { publishFeedbackJob } from '../src/services/helpers/feedbackProducer'

/**
 * Manually publish feedback jobs without waiting for the 2am cron.
 *
 *   npx ts-node scripts/trigger-feedback.ts            # all eligible users
 *   npx ts-node scripts/trigger-feedback.ts <userId>   # one specific user
 *
 * Start the worker first (`npm run worker:dev`) to watch jobs get consumed.
 */
const main = async (): Promise<void> => {
  const userIdArg = process.argv[2]

  const userIds = userIdArg ? [userIdArg] : await getEligibleUserIds()

  if (userIds.length === 0) {
    console.log('No eligible users found (need >=3 quizzes, 7-day cooldown).')
    console.log(
      'Pass a userId explicitly to force-publish: npx ts-node scripts/trigger-feedback.ts <userId>',
    )
    process.exit(0)
  }

  console.log(`Publishing ${userIds.length} feedback job(s)...`)
  for (const userId of userIds) {
    await publishFeedbackJob(userId)
    console.log(`  published userId=${userId}`)
  }

  console.log('Done. Watch the worker terminal for processing logs.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Trigger failed:', err)
  process.exit(1)
})
