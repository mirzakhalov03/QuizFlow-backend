import { eq, sql, and } from 'drizzle-orm'
import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import { db } from '../database/database'
import { users } from '../database/schema'
import { userIntegrations } from '../database/schema'
import User from '../models/user.model'
import UserIntegrations from '../models/userIntegration.model'
import userProfile from '../models/userProfile.model'
import { generateAccessToken, generateRefreshToken } from '../utils/jwt'

type AuthUser = {
  id: string
  email?: string
}

type AuthRequest = Request & {
  user?: AuthUser
}

const logoutUser = (req: Request, res: Response) => {
  try {
    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })

    return res.status(200).json({ message: 'Logged out successfully' })
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' })
  }
}

/*-- Google OAuth2 Flow--*/

const redirectUser = async (req: Request, res: Response) => {
  const googleAuthUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    '?client_id=' +
    process.env.GOOGLE_CLIENT_ID +
    '&redirect_uri=' +
    process.env.GOOGLE_REDIRECT_URI +
    '&response_type=code' +
    '&scope=openid email profile'
  res.redirect(googleAuthUrl)
}
const googleCallback = async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string

    if (!code) {
      return res.status(400).json({ message: 'No code provided' })
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenResponse.json()

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    const profile = await userInfoResponse.json()

    const existingUser = await User.findByEmail(profile.email)

    const user =
      existingUser ??
      (await User.createUser({
        email: profile.email,
        fullName: profile.name,
      }))

    const existingProfile = await userProfile.findByUserId(user.id)

    if (!existingProfile) {
      await userProfile.createUserProfile({
        userId: user.id,
        bio: null,
        profilePicture: profile.picture ?? null,
      })
    }

    const existingIntegration = await UserIntegrations.findByUserIdAndProvider(user.id, 'google')

    if (!existingIntegration) {
      await UserIntegrations.createUser({
        userId: user.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? '',
        provider: 'google',
      })
    } else {
      await db
        .update(userIntegrations)
        .set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? existingIntegration.refreshToken,
        })
        .where(and(eq(userIntegrations.userId, user.id), eq(userIntegrations.provider, 'google')))
    }

    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken(user)

    await db.update(users).set({ refreshToken }).where(eq(users.id, user.id))

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })
    return res.redirect('http://localhost:5173/')
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}

/*-- Notion OAuth2 Flow--*/

const redirectToNotion = (req: Request, res: Response) => {
  const notionAuthUrl =
    `https://api.notion.com/v1/oauth/authorize` +
    `?client_id=${process.env.NOTION_CLIENT_ID}` +
    `&response_type=code` +
    `&owner=user` +
    `&redirect_uri=${encodeURIComponent(process.env.NOTION_REDIRECT_URI!)}`

  return res.redirect(notionAuthUrl)
}
const notionCallback = async (req: AuthRequest, res: Response) => {
  try {
    const code = req.query.code as string

    if (!code) {
      return res.status(400).json({ message: 'No code provided' })
    }

    const user = req.user

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`,
          ).toString('base64'),
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI,
      }),
    })

    const data = await tokenResponse.json()

    if (!data?.access_token) {
      return res.status(400).json({ message: 'Failed to get Notion token' })
    }

    const existingIntegration = await UserIntegrations.findByUserIdAndProvider(user.id, 'notion')

    if (!existingIntegration) {
      await UserIntegrations.createUser({
        userId: user.id,
        accessToken: data.access_token,
        refreshToken: '',
        provider: 'notion',
      })
    } else {
      await db
        .update(userIntegrations)
        .set({
          accessToken: data.access_token,
        })
        .where(and(eq(userIntegrations.userId, user.id), eq(userIntegrations.provider, 'notion')))
    }

    return res.redirect('http://localhost:5173/integrations/success')
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
/*-- Refresh Token Flow--*/
type JwtPayloadUser = {
  id: string
}
const refreshToken = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken

  if (!refreshToken) {
    return res.status(401).json({ message: 'No refresh token' })
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET!) as JwtPayloadUser

    const newAccessToken = jwt.sign({ id: decoded.id }, process.env.ACCESS_TOKEN_SECRET!, {
      expiresIn: '15m',
    })

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      sameSite: 'strict',
    })

    return res.json({ message: 'Token refreshed' })
  } catch {
    return res.status(401).json({ message: 'Invalid refresh token' })
  }
}
export { logoutUser, redirectUser, googleCallback, redirectToNotion, notionCallback, refreshToken }
