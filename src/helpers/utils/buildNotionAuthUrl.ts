export const buildNotionAuthUrl = () => {
  const url = new URL('https://api.notion.com/v1/oauth/authorize')

  url.searchParams.append('client_id', process.env.NOTION_CLIENT_ID!)
  url.searchParams.append('response_type', 'code')
  url.searchParams.append('owner', 'user')
  url.searchParams.append('redirect_uri', process.env.NOTION_REDIRECT_URI!)

  return url.toString()
}
