import './instrument'
import dotenv from 'dotenv'
dotenv.config()

import app from './app'
import { logger } from './config/logger'
import { startFeedbackCron } from './crons/feedbackCron'

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`)
  startFeedbackCron()
})
