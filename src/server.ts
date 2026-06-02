import dotenv from 'dotenv'
dotenv.config()

import app from './app'
import { startFeedbackCron } from './crons/feedbackCron'

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  startFeedbackCron()
})
