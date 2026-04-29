import cookieParser from 'cookie-parser'
import express from 'express'
import logger from 'morgan'

import { successResponse } from './helpers/apiResponse'
import { errorHandler } from './middlewares/errorHandler'
import { handleMulterError } from './middlewares/multerUpload'
import { notFoundHandler } from './middlewares/notFound'
import uploadRoutes from './routes/upload.routes'

const app = express()

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

app.get('/health', (_req, res) => {
  res.status(200).json(successResponse('API is healthy', { uptime: process.uptime() }))
})

app.use(uploadRoutes)

app.use(handleMulterError)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
