import cookieParser from 'cookie-parser'
import express from 'express'
import logger from 'morgan'
import swaggerUi from 'swagger-ui-express'

import { swaggerSpec } from './config/swagger'
import { errorHandler } from './middlewares/errorHandler'
import { handleMulterError } from './middlewares/multerUpload'
import { notFoundHandler } from './middlewares/notFound'
import authRoutes from './routes/auth'
import healthRoutes from './routes/health.routes'
import quizRoutes from './routes/quiz.routes'
import uploadRoutes from './routes/upload.routes'

const app = express()

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

app.use('/auth', authRoutes)
app.use(healthRoutes)
app.use(uploadRoutes)
app.use(quizRoutes)

app.use(handleMulterError)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
