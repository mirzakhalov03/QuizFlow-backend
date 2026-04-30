import path from 'path'

import swaggerJSDoc from 'swagger-jsdoc'

const port = process.env.PORT || 3000

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'QuizFlow AI Backend API',
      version: '1.0.0',
      description: 'API documentation for QuizFlow AI backend services.',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Local development server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health and readiness checks' },
      { name: 'Upload', description: 'File upload APIs' },
      { name: 'Quiz', description: 'Quiz generation and CRUD APIs' },
    ],
    components: {
      schemas: {
        ApiSuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Request succeeded' },
            data: { type: 'object', nullable: true },
            error: { nullable: true, example: null },
          },
        },
        ApiErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            data: { nullable: true, example: null },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                details: { nullable: true },
              },
            },
          },
        },
        QuestionType: {
          type: 'string',
          enum: ['multiple_choice', 'multi_select', 'open_ended', 'true_false'],
        },
        QuizGenerateRequest: {
          type: 'object',
          required: ['userId'],
          properties: {
            s3Url: { type: 'string', format: 'uri' },
            bucket: { type: 'string' },
            key: { type: 'string' },
            userId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            userInstructions: { type: 'string', nullable: true },
            isTimerEnabled: { type: 'boolean', default: false },
            timerDuration: { type: 'number', nullable: true },
            type: { $ref: '#/components/schemas/QuestionType' },
          },
        },
        QuizPatchRequest: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            userInstructions: { type: 'string', nullable: true },
            isTimerEnabled: { type: 'boolean' },
            timerDuration: { type: 'number', nullable: true },
            type: { $ref: '#/components/schemas/QuestionType' },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../app.ts'), path.join(__dirname, '../routes/*.ts')],
}

export const swaggerSpec = swaggerJSDoc(options)
