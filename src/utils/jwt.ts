import jwt from 'jsonwebtoken'

type JwtUser = {
  id: string
  email?: string
}

export const generateAccessToken = (user: JwtUser) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' },
  )
}
export const generateRefreshToken = (user: JwtUser) => {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' },
  )
}
