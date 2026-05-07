// services/userProfileImageService.ts

import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import { s3BucketName, s3Client, s3Region } from './s3Client'
import { AppError } from '../helpers/AppError'
import userProfile from '../models/userProfile.model'

class UserProfileImageService {
  static buildS3Key(userId: string) {
    return `users/${userId}/avatar`
  }

  static buildFileUrl(key: string) {
    return `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${key}`
  }

  static isOurS3File(url: string) {
    return url.includes(`${s3BucketName}.s3.${s3Region}.amazonaws.com`)
  }

  static async uploadProfileImage(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED')
    }

    const existingProfile = await userProfile.findByUserId(userId)

    const key = this.buildS3Key(userId)

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
