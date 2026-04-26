import { eq, sql } from 'drizzle-orm'
import { Request, Response } from 'express'

import { db } from '../database/database'
import { users } from '../database/schema'
import User from '../models/user.model'
import { generateAccessToken, generateRefreshToken } from '../utils/jwt'

const loginUser = async (req: Request, res: Response) => {}

const logoutUser = (req: Request, res: Response) => {}

const redirectUser = async (req: Request, res: Response) => {
  await db.execute(sql`SELECT 1`)
  console.log(process.env.DATABASE_URL)
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

    const accessToken = generateAccessToken(user)
    const refreshToken = generateRefreshToken(user)

    await db.update(users).set({ refreshToken }).where(eq(users.id, user.id))

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    })

    return res.redirect('http://localhost:5173/auth/success')
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}
export { loginUser, logoutUser, redirectUser, googleCallback }
