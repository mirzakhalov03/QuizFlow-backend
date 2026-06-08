import 'dotenv/config'

interface OpenRouterModel {
  id: string
}

async function listAllModels() {
  const response = await fetch('https://openrouter.ai/api/v1/models')
  const data = (await response.json()) as { data: OpenRouterModel[] }
  const models = data.data.map((m) => m.id)
  console.log(JSON.stringify(models, null, 2))
}

listAllModels()
