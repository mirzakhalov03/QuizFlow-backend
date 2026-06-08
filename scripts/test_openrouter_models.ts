import 'dotenv/config'
import OpenAI from 'openai'

async function testCompletion() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY missing')
    return
  }

  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  })

  const models = [
    'openai/gpt-4o-mini',
    'deepseek/deepseek-chat-v3',
    'meta-llama/llama-3.3-70b-instruct',
  ]

  for (const model of models) {
    console.log(`Testing model: ${model}...`)
    try {
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: 'Say hello' }],
        max_tokens: 10,
      })
      console.log(
        `SUCCESS: ${model} responded with: ${completion.choices[0]?.message?.content ?? ''}`,
      )
    } catch (err: unknown) {
      const error = err as Record<string, unknown> | null | undefined
      console.error(`FAILED: ${model}`)
      console.error(`Status: ${error?.status}`)
      console.error(`Message: ${error?.message}`)
      if (error?.response) {
        console.error('Response body:', JSON.stringify(error.response, null, 2))
      }
      console.log('---')
    }
  }
}

testCompletion()
