import 'dotenv/config'
import { generateQuizFromText } from '../src/services/quizAi'

async function testGeneration() {
  console.log('Testing quiz generation with google/gemini-3.5-flash...')
  try {
    const result = await generateQuizFromText({
      sourceText: 'The capital of France is Paris. It is known for the Eiffel Tower.',
      questionCount: 1,
      model: 'google/gemini-3.5-flash',
    })
    console.log('SUCCESS!')
    console.log(JSON.stringify(result, null, 2))
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string; details?: unknown }
    console.error('FAILED generation')
    console.error(`Message: ${error.message}`)
    console.error(`Code: ${error.code}`)
    console.error(`Details: ${JSON.stringify(error.details, null, 2)}`)
  }
}

testGeneration()
