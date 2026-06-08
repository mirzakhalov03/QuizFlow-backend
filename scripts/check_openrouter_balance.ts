import 'dotenv/config'

async function checkBalance() {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    console.error('Error: OPENROUTER_API_KEY is not defined in .env')
    process.exit(1)
  }

  console.log('Fetching OpenRouter credit balance...')

  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error(`Error (${response.status}):`, errorData)
      return
    }

    const data = await response.json()
    console.log('\n--- OpenRouter Balance Info ---')
    console.log(JSON.stringify(data, null, 2))
    console.log('-------------------------------\n')
  } catch (error) {
    console.error('Failed to fetch balance:', error)
  }
}

checkBalance()
