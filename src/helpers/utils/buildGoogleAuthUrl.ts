export const buildGoogleAuthUrl = () => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')

  url.searchParams.append('client_id', process.env.GOOGLE_CLIENT_ID!)
  url.searchParams.append('redirect_uri', process.env.GOOGLE_REDIRECT_URI!)
  url.searchParams.append('response_type', 'code')
  url.searchParams.append('scope', 'openid email profile')

  return url.toString()
}
