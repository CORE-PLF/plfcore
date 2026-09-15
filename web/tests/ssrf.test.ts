import { describe, expect, test } from 'vitest'
import { assertPublicHttpsUrl, isPrivateAddress } from '@/lib/ssrf'

describe('isPrivateAddress', () => {
  const privados = [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:10.0.0.1',
  ]
  for (const ip of privados) {
    test(`${ip} é privado`, () => {
      expect(isPrivateAddress(ip)).toBe(true)
    })
  }

  const publicos = ['8.8.8.8', '200.147.3.157', '2600::']
  for (const ip of publicos) {
    test(`${ip} é público`, () => {
      expect(isPrivateAddress(ip)).toBe(false)
    })
  }
})

// Só casos que falham ANTES do DNS — sem dependência de rede externa.
describe('assertPublicHttpsUrl', () => {
  test('rejeita http://', async () => {
    await expect(assertPublicHttpsUrl('http://exemplo.com/webhook')).rejects.toThrow(/https/)
  })

  test('rejeita localhost', async () => {
    await expect(assertPublicHttpsUrl('https://localhost/x')).rejects.toThrow(/privad|local/i)
  })

  test('rejeita IP de loopback', async () => {
    await expect(assertPublicHttpsUrl('https://127.0.0.1/x')).rejects.toThrow(/privad|local/i)
  })

  test('rejeita IP de metadata', async () => {
    await expect(assertPublicHttpsUrl('https://169.254.169.254/x')).rejects.toThrow(/privad|local/i)
  })

  test('rejeita URL malformada', async () => {
    await expect(assertPublicHttpsUrl('não é url')).rejects.toThrow(/inválida/i)
  })
})
