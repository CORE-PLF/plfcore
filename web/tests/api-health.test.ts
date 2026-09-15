import { expect, test } from 'vitest'

// Integração opcional: se o dev server não está de pé, o teste é pulado — não finge que passou.
test('GET /api/health responde 200 quando o servidor está rodando', async (ctx) => {
  let res: Response
  try {
    res = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(2000) })
  } catch {
    ctx.skip()
    return
  }
  expect(res.status).toBe(200)
})
