import { randomUUID } from 'crypto'

import { PutObjectCommand } from '@aws-sdk/client-s3'

import { invokeQuizGenerator } from './invokeQuizGenerator'
import notionService from './notionService'
import { s3Client, s3BucketName } from './s3Client'
import { AppError } from '../helpers/AppError'
import type { QuestionType } from '../types/questionTypes'

type GenerateQuizFromNotionInput = {
  userId: string
  pageId: string
  title?: string
  userInstructions?: string
  isTimerEnabled?: boolean
  timerDuration?: number
  type?: QuestionType
  questionCount?: number
}

const MAX_NOTION_CONTENT_BYTES = 15 * 1024 * 1024 // 15 MB

class NotionQuizService {
  async generateQuizFromNotionPage(input: GenerateQuizFromNotionInput) {
    try {
      // 1. Fetch content from Notion page
      const notionContent = await notionService.getPageContent(input.userId, input.pageId)

      if (!notionContent || notionContent.trim().length === 0) {
        throw new AppError(
          'No content found in the selected Notion page or its databases',
          400,
          'EMPTY_NOTION_PAGE',
        )
      }

      // 2. Check size
      const contentBytes = Buffer.byteLength(notionContent, 'utf8')
      if (contentBytes > MAX_NOTION_CONTENT_BYTES) {
        throw new AppError(
          `Notion page content exceeds ${MAX_NOTION_CONTENT_BYTES / 1024 / 1024}MB limit (${(contentBytes / 1024 / 1024).toFixed(2)}MB)`,
          413,
          'CONTENT_TOO_LARGE',
        )
      }

      // 3. Upload to S3 as temp file
      const key = `notion-temp/${input.userId}/${randomUUID()}.txt`
      await s3Client.send(
        new PutObjectCommand({
          Bucket: s3BucketName,
          Key: key,
          Body: notionContent,
          ContentType: 'text/plain',
        }),
      )

      // 4. Invoke quiz generator Lambda with S3 location
      const jobId = await invokeQuizGenerator({
        bucket: s3BucketName,
        key,
        userId: input.userId,
        title: input.title,
        userInstructions: input.userInstructions,
        isTimerEnabled: input.isTimerEnabled,
        timerDuration: input.timerDuration,
        type: input.type,
        questionCount: input.questionCount,
      })

      return {
        jobId,
        pollUrl: `/quizzes/jobs/${jobId}`,
        sourceType: 'notion',
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError(
        err instanceof Error ? err.message : 'Failed to generate quiz from Notion',
        500,
        'NOTION_QUIZ_GENERATION_FAILED',
      )
    }
  }
}

export default new NotionQuizService()
