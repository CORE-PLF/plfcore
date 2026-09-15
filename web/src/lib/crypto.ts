import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { env } from './env'

// ===== senhas (scrypt — stdlib, sem dependência nativa) =====
// Assíncrono de propósito: a variante sync trava o event loop por dezenas de
// ms por chamada — sob rajada num caminho não autenticado, o processo inteiro
// (inclusive o webhook de pagamento) para de responder.

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split(':')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const hash = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(hashHex, 'hex')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}

// ===== tokens opacos (sessões, reset de senha) =====

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSign(value: string, secret = env.PAYMENT_WEBHOOK_SECRET): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function hmacVerify(value: string, signature: string, secret = env.PAYMENT_WEBHOOK_SECRET): boolean {
  const expected = hmacSign(value, secret)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ===== chave de licença =====
// Formato de exibição RESYNC-XXXX-XXXX-XXXX-XXXX, mas a entropia vem de
// 20 bytes aleatórios (160 bits) — o formato é só apresentação.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0/O/1/I

export function generateLicenseKey(): string {
  const bytes = randomBytes(20)
  let out = ''
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  const groups = out.match(/.{4}/g) as string[]
  return `RESYNC-${groups.join('-')}`
}

export function maskLicenseKey(key: string): string {
  const parts = key.split('-')
  return `${parts[0]}-${parts[1]}-****-****-${parts[parts.length - 1]}`
}

// ===== criptografia de dados sensíveis (AES-256-GCM) =====

function encryptionKey(): Buffer {
  return createHash('sha256').update(env.ENCRYPTION_KEY).digest()
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`
}

export function decrypt(ciphertext: string): string {
  const [ivB64, dataB64, tagB64] = ciphertext.split('.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8')
}

// ===== TOTP (RFC 6238) para admins — stdlib, sem dependência =====

export function generateTotpSecret(): string {
  return randomBytes(20).toString('hex')
}

// Segredo TOTP cifrado em repouso (AES-GCM). Registros legados em hex puro
// (40 chars) continuam legíveis e são re-cifrados na próxima gravação.
export function sealTotpSecret(secretHex: string): string {
  return encrypt(secretHex)
}

export function openTotpSecret(stored: string): string {
  return /^[0-9a-f]{40}$/i.test(stored) ? stored : decrypt(stored)
}

export function totpCode(secretHex: string, timeStep = Math.floor(Date.now() / 30000)): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(timeStep))
  const hmac = createHmac('sha1', Buffer.from(secretHex, 'hex')).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
  return code
}

export function verifyTotp(secretHex: string, code: string): boolean {
  const step = Math.floor(Date.now() / 30000)
  // aceita a janela anterior e a próxima (clock skew)
  return [step - 1, step, step + 1].some((s) => totpCode(secretHex, s) === code)
}
