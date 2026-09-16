import { describe, expect, test } from 'vitest'
import {
  decrypt,
  encrypt,
  generateLicenseKey,
  generateTotpSecret,
  hashPassword,
  hmacSign,
  hmacVerify,
  totpCode,
  verifyPassword,
  verifyTotp,
} from '@/lib/crypto'

describe('senha (scrypt)', () => {
  test('verifica senha correta e rejeita errada', async () => {
    const stored = await hashPassword('segredo-forte-123')
    expect(await verifyPassword('segredo-forte-123', stored)).toBe(true)
    expect(await verifyPassword('segredo-errado', stored)).toBe(false)
    expect(await verifyPassword('segredo-forte-123', 'lixo-sem-formato')).toBe(false)
  })
})

describe('chave de licença', () => {
  test('formato PLF-XXXX-XXXX-XXXX-XXXX sem 0/O/1/I', () => {
    const key = generateLicenseKey()
    expect(key).toMatch(/^PLF(-[A-HJ-NP-Z2-9]{4}){4}$/)
  })

  test('1000 chaves são todas únicas', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateLicenseKey()))
    expect(keys.size).toBe(1000)
  })
})

describe('encrypt/decrypt (AES-256-GCM)', () => {
  test('roundtrip devolve o texto original', () => {
    const plain = 'RESYNC-ABCD-EFGH-JKLM-NPQR'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  test('IV aleatório: dois ciphertexts do mesmo texto diferem', () => {
    expect(encrypt('mesmo texto')).not.toBe(encrypt('mesmo texto'))
  })
})

describe('hmac', () => {
  test('assinatura válida verifica; adulterada não', () => {
    const body = '{"orderId":"abc","total":5990}'
    const sig = hmacSign(body)
    expect(hmacVerify(body, sig)).toBe(true)

    // troca o primeiro caractere hex mantendo o tamanho
    const tampered = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1)
    expect(hmacVerify(body, tampered)).toBe(false)
    // corpo alterado também falha
    expect(hmacVerify(body + 'x', sig)).toBe(false)
    // tamanho diferente não explode, só falha
    expect(hmacVerify(body, sig.slice(0, 10))).toBe(false)
  })
})

describe('totp', () => {
  test('gera e verifica código; rejeita código errado', () => {
    const secret = generateTotpSecret()
    const code = totpCode(secret)
    expect(code).toMatch(/^\d{6}$/)
    expect(verifyTotp(secret, code)).toBe(true)

    // acha um código de 6 dígitos fora da janela aceita (-1, 0, +1)
    const step = Math.floor(Date.now() / 30000)
    const valid = new Set([step - 1, step, step + 1].map((s) => totpCode(secret, s)))
    let wrong = '000000'
    while (valid.has(wrong)) wrong = String(Number(wrong) + 1).padStart(6, '0')
    expect(verifyTotp(secret, wrong)).toBe(false)
  })
})
