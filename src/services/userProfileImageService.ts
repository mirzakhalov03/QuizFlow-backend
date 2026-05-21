import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import { s3BucketName, s3Client, s3Region } from './s3Client'
import { AppError } from '../helpers/AppError'
import userProfile from '../models/userProfile.model'
const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function validateImageFile(file: Express.Multer.File) {
  if (!file) {
    throw new AppError('File is required', 400, 'FILE_REQUIRED')
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new AppError('File is too large (max 15MB)', 400, 'FILE_TOO_LARGE')
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError(
      'Invalid file type. Only JPG, PNG, WEBP, GIF allowed',
      400,
      'INVALID_FILE_TYPE',
    )
  }
}

class UserProfileImageService {
  static buildS3Key(userId: string, file: Express.Multer.File) {
    const extension = file.mimetype.split('/')[1]
    return `users/${userId}/avatar.${extension}`
  }

  static buildFileUrl(key: string) {
    return `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${key}`
  }

  static isOurS3File(url: string) {
    return url.includes(`${s3BucketName}.s3.${s3Region}.amazonaws.com`)
  }

  static async uploadProfileImage(userId: string, file: Express.Multer.File) {
    validateImageFile(file)

    const existingProfile = await userProfile.findByUserId(userId)

    const key = this.buildS3Key(userId, file)

    if (existingProfile?.profilePicture && this.isOurS3File(existingProfile.profilePicture)) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: s3BucketName,
          Key: key,
        }),
      )
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3BucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    )

    const fileUrl = this.buildFileUrl(key)

    const updatedProfile = await userProfile.upsert(userId, existingProfile?.bio, fileUrl)

    return updatedProfile
  }
}

export default UserProfileImageService
