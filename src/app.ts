import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import logger from 'morgan'
import swaggerUi from 'swagger-ui-express'

import { swaggerSpec } from './config/swagger'
import { errorHandler } from './middlewares/errorHandler'
import { handleMulterError } from './middlewares/multerUpload'
import { notFoundHandler } from './middlewares/notFound'
import authRoutes from './routes/auth.routes'
import byokRoutes from './routes/byok.routes'
import healthRoutes from './routes/health.routes'
import quizRoutes from './routes/quiz.routes'
import uploadRoutes from './routes/upload.routes'
import userProfileRoutes from './routes/userProfile.routes'

const app = express()

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || 'http://localhost:5173'],
    credentials: true,
  }),
)

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.use(authRoutes)
app.use(userProfileRoutes)
app.use(healthRoutes)
app.use(uploadRoutes)
app.use(quizRoutes)
app.use(byokRoutes)

app.use(handleMulterError)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
