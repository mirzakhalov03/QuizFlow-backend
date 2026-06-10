import 'dotenv/config'

function checkKey() {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    console.log('Key is missing')
    return
  }
  console.log(`Key length: ${key.length}`)
  console.log(`Starts with: ${key.substring(0, 3)}...`)
  console.log(`Ends with: ...${key.substring(key.length - 3)}`)
  console.log(`Has whitespace: ${/\s/.test(key)}`)
}

checkKey()
