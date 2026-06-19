import 'dotenv/config'

import { eq } from 'drizzle-orm'

import { db } from '../src/database/database'
import { userProfiles } from '../src/database/schema'
import User from '../src/models/user.model'
import { generateFeedbackForUser } from '../src/services/feedback.service'

/**
 * Generate AI feedback for one user RIGHT NOW (bypasses SQS/worker/cron).
 * Calls the service directly so the result lands in `userProfiles` synchronously.
 *
 *   npx ts-node scripts/run-feedback-now.ts <email>
 */
const main = async (): Promise<void> => {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npx ts-node scripts/run-feedback-now.ts <email>')
    process.exit(1)
  }

  const user = await User.findByEmail(email)
  if (!user) {
    console.error(`No user found for email: ${email}`)
    process.exit(1)
  }

  console.log(`Generating feedback for ${email} (userId=${user.id})...`)
  await generateFeedbackForUser(user.id)

  const [profile] = await db
    .select({
      aiFeedback: userProfiles.aiFeedback,
      aiFeedbackGeneratedAt: userProfiles.aiFeedbackGeneratedAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id))

  if (!profile?.aiFeedback) {
    console.log(
      'No feedback was written. Likely <3 gradable quizzes for this user, or the LLM call returned nothing.',
    )
  } else {
    console.log('\nFeedback written to userProfiles:')
    console.log(JSON.stringify(profile.aiFeedback, null, 2))
    console.log(`\ngeneratedAt: ${profile.aiFeedbackGeneratedAt}`)
    console.log('\nReload the Account page — the AI Learning Feedback card should now appear.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
