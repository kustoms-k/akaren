import express from 'express'

const app = express()
const PORT = process.env.PORT || 3002

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', port: PORT, node: process.version })
})

app.get('/', (req, res) => {
  res.status(200).send('Åkaren is running')
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on port ${PORT}`)
})
