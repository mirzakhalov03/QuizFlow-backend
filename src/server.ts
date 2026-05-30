import dotenv from 'dotenv'
dotenv.config()
console.log(process.env.DATABASE_URL)

import app from './app'

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
