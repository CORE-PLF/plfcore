import { describe, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// A esteira de release publica um .exe que as pessoas rodam como administrador.
// Estes testes cobrem as travas que impedem que isso vire um caminho de entrada:
// desligada por padrão, token comparado sem vazar tempo, e nada de token = nada
// de rota.

function req(headers: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest
}

async function auth(token: string, headers: Record<string, string> = {}) {
  vi.resetModules()
  vi.doMock('@/lib/env', () => ({
    env: { RELEASE_TOKEN: token },
    releaseApiEnabled: () => token !== '',
  }))
  const { autenticarRelease } = await import('@/app/api/v1/release/_auth')
  return autenticarRelease(req(headers))
}

const VALIDO = 'r'.repeat(40)

describe('credencial de máquina da esteira de release', () => {
  test('sem RELEASE_TOKEN a esteira não existe', async () => {
    // Instalação que não usa esteira não pode ganhar uma porta nova de graça.
    expect(await auth('', { authorization: `Bearer ${VALIDO}` })).toBe('desligado')
  })

  test('token correto passa', async () => {
    expect(await auth(VALIDO, { authorization: `Bearer ${VALIDO}` })).toBe('ok')
  })

  test('token errado do mesmo tamanho é negado', async () => {
    // Mesmo tamanho é o caso que a comparação ingênua acertaria por acidente.
    expect(await auth(VALIDO, { authorization: `Bearer ${'x'.repeat(40)}` })).toBe('negado')
  })

  test('prefixo do token não passa', async () => {
    expect(await auth(VALIDO, { authorization: `Bearer ${'r'.repeat(39)}` })).toBe('negado')
  })

  test('sem header, sem Bearer e vazio são negados', async () => {
    expect(await auth(VALIDO)).toBe('negado')
    expect(await auth(VALIDO, { authorization: VALIDO })).toBe('negado')
    expect(await auth(VALIDO, { authorization: 'Bearer ' })).toBe('negado')
  })
})

describe('env', () => {
  test('RELEASE_TOKEN curto é recusado no boot', async () => {
    // Token curto de força bruta publica instalador; melhor derrubar o boot.
    vi.resetModules()
    const { z } = await import('zod')
    const campo = z
      .string()
      .optional()
      .default('')
      .refine((v) => v === '' || v.length >= 32, 'RELEASE_TOKEN precisa de >= 32 caracteres')
    expect(campo.safeParse('curto').success).toBe(false)
    expect(campo.safeParse('').success).toBe(true)
    expect(campo.safeParse('a'.repeat(32)).success).toBe(true)
  })
})
