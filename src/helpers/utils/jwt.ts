import jwt from 'jsonwebtoken'

type JwtUser = {
  id: string
}

export const generateAccessToken = (user: JwtUser) => {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: '1h' },
  )
}
export const generateRefreshToken = (user: JwtUser) => {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.REFRESH_TOKEN_SECRET!,
    { expiresIn: '7d' },
  )
}
