import * as Sentry from '@sentry/node'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'

import { logger } from './config/logger'
import { swaggerSpec } from './config/swagger'
import { allowedOrigins } from './helpers/utils/frontendUrl'
import { errorHandler } from './middlewares/errorHandler'
import { handleMulterError } from './middlewares/multerUpload'
import { notFoundHandler } from './middlewares/notFound'
import { requestLogger } from './middlewares/requestLogger'
import analyticsRoutes from './routes/analytics.routes'
import authRoutes from './routes/auth.routes'
import bookmarkRoutes from './routes/bookmark.routes'
import byokRoutes from './routes/byok.routes'
import contactRoutes from './routes/contact.routes'
import folderRoutes from './routes/folder.routes'
import healthRoutes from './routes/health.routes'
import integrationRoutes from './routes/integrations.routes'
import marketplaceRoutes from './routes/marketplace.routes'
import quizRoutes from './routes/quiz.routes'
import uploadRoutes from './routes/upload.routes'
import userProfileRoutes from './routes/userProfile.routes'

const app = express()

app.use(requestLogger)
app.use(
  morgan('dev', {
    stream: { write: (message) => logger.http(message.trim()) },
  }),
)
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.use(authRoutes)
app.use(userProfileRoutes)
app.use(integrationRoutes)
app.use(healthRoutes)
app.use(contactRoutes)
app.use(uploadRoutes)
app.use(quizRoutes)
app.use(bookmarkRoutes)
// Registered before folderRoutes: folderRoutes applies authMiddleware globally
// (router.use), which would otherwise intercept the public GET /marketplace routes.
app.use(marketplaceRoutes)
app.use(folderRoutes)
app.use(byokRoutes)
app.use(analyticsRoutes)

app.use(notFoundHandler)
Sentry.setupExpressErrorHandler(app)
app.use(handleMulterError)
app.use(errorHandler)

export default app
