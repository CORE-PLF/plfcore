import { hmacSign } from '@/lib/crypto'
import { env } from '@/lib/env'

// Cookie de 2FA verificada: valor assinado (HMAC) com expiração embutida —
// presença do cookie sozinha não basta, o conteúdo precisa validar.

export const TOTP_COOKIE = 'bbx_totp_ok'
export const TOTP_HOURS = 12

export function totpCookieValue(userId: string): string {
  const exp = Date.now() + TOTP_HOURS * 3600_000
  return `${exp}.${hmacSign(`totp-ok:${userId}:${exp}`, env.ENCRYPTION_KEY)}`
}

export function totpCookieValid(userId: string, value: string | undefined): boolean {
  if (!value) return false
  const [expStr, sig] = value.split('.')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false
  return hmacSign(`totp-ok:${userId}:${exp}`, env.ENCRYPTION_KEY) === sig
}
