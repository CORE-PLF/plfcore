import 'dotenv/config'
import { afterAll } from 'vitest'

afterAll(async () => {
  const { db } = await import('@/lib/db')
  await db.$disconnect()
})
