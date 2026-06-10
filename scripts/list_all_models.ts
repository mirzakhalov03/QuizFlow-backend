import 'dotenv/config'

interface OpenRouterModel {
  id: string
}

async function listAllModels() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models')
    if (!response.ok) {
      console.error(`Failed to fetch models: ${response.status} ${response.statusText}`)
      return
    }
    const data = (await response.json()) as { data?: OpenRouterModel[] }
    const models = data?.data?.map((m) => m.id) || []
    console.log(JSON.stringify(models, null, 2))
  } catch (error) {
    console.error('Error listing models:', error)
  }
}

listAllModels()
