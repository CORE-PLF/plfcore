import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { sha256 } from '@/lib/crypto'
import { realIp } from '@/lib/ip'
import { rateLimit } from '@/lib/ratelimit'
import type { LicenseCheckCode } from '@/lib/licensing'

// Helpers da API v1 (aplicativo). Erro SEMPRE { error: { code, message } }.
// A chave de licença NUNCA aparece em log nem em chave de rate limit — só o
// fingerprint (sha256 truncado).

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

export function clientIp(req: NextRequest): string {
  return realIp(req.headers) ?? 'unknown'
}

export function keyFingerprint(key: string): string {
  return sha256(key).slice(0, 16)
}

export async function checkRate(
  req: NextRequest,
  route: string,
  key = '',
  limit = 30,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  const id = `v1:${route}:${clientIp(req)}:${key ? keyFingerprint(key) : ''}`
  if (!(await rateLimit(id, limit, windowMs))) {
    return apiError(429, 'ERR_RATE_LIMITED', 'Muitas requisições. Aguarde um minuto e tente de novo.')
  }
  return null
}

// ===== corpo =====

// hwid = SHA-256 (64 hex) calculado NO APLICATIVO sobre um identificador da
// instalação que muda ao formatar o Windows (ex.: MachineGuid). Identificador
// bruto (serial de placa/disco, GUID em claro) é rejeitado — só o hash entra.
const hwidHash = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, 'envie o SHA-256 do identificador da instalação (64 caracteres hex), nunca o identificador bruto')

export const activateSchema = z.object({
  key: z.string().min(1).max(64),
  hwid: hwidHash,
  deviceName: z.string().max(100).optional(),
  appVersion: z.string().max(32).optional(),
})
export const keyHwidSchema = activateSchema.pick({ key: true, hwid: true })
export const tokenHwidSchema = z.object({
  token: z.string().min(32).max(128),
  hwid: hwidHash,
})
export const heartbeatSchema = tokenHwidSchema.extend({
  appVersion: z.string().max(32).optional(),
})

export async function parseBody<S extends z.ZodType>(
  req: NextRequest,
  schema: S,
): Promise<{ data: z.infer<S>; res: null } | { data: null; res: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { data: null, res: apiError(400, 'ERR_INVALID_BODY', 'Corpo não é JSON válido. Envie application/json.') }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      data: null,
      res: apiError(400, 'ERR_INVALID_BODY', `Campo inválido: ${first.path.join('.') || '(raiz)'} — ${first.message}`),
    }
  }
  return { data: parsed.data as z.infer<S>, res: null }
}

// ===== mapeamento LicenseCheckCode → HTTP =====

const CHECK_ERRORS: Record<Exclude<LicenseCheckCode, 'OK'>, { status: number; code: string; message: string }> = {
  NOT_FOUND: { status: 404, code: 'ERR_LICENSE_NOT_FOUND', message: 'Chave de licença não encontrada. Confira a chave no seu painel em /painel/licencas.' },
  EXPIRED: { status: 403, code: 'ERR_LICENSE_EXPIRED', message: 'Licença expirada. Renove no painel para voltar a usar o aplicativo.' },
  SUSPENDED: { status: 403, code: 'ERR_LICENSE_SUSPENDED', message: 'Licença suspensa. Abra um chamado no suporte para entender o motivo.' },
  REVOKED: { status: 403, code: 'ERR_LICENSE_REVOKED', message: 'Licença revogada. Se acha que foi engano, fale com o suporte.' },
  BLOCKED: { status: 403, code: 'ERR_LICENSE_BLOCKED', message: 'Licença bloqueada. Fale com o suporte.' },
  REPLACED: { status: 410, code: 'ERR_LICENSE_REPLACED', message: 'Esta chave foi substituída. Use a chave nova, disponível no seu painel.' },
  DEVICE_LIMIT: { status: 409, code: 'ERR_DEVICE_LIMIT', message: 'Esta chave já está vinculada a outra instalação. Adquira uma nova licença no painel.' },
  DEVICE_REVOKED: { status: 403, code: 'ERR_DEVICE_REVOKED', message: 'Este dispositivo foi desativado para esta licença pelo suporte. Abra um chamado se precisar reativar.' },
  INSTALLATION_CONSUMED: {
    status: 409,
    code: 'ERR_INSTALLATION_ALREADY_CONSUMED',
    message:
      'Esta chave já foi consumida por outra instalação do Windows. Após formatar ou trocar de computador é preciso adquirir uma nova licença no painel.',
  },
}

export function checkError(code: Exclude<LicenseCheckCode, 'OK'>): NextResponse {
  const e = CHECK_ERRORS[code]
  return apiError(e.status, e.code, e.message)
}

export const deviceNotBound = () =>
  apiError(403, 'ERR_DEVICE_NOT_BOUND', 'Dispositivo não vinculado a esta licença. Execute a ativação neste computador.')

// ===== versão mínima do app (semver simples, sem lib) =====

function semverLt(a: string, b: string): boolean {
  const pa = a.replace(/^v/i, '').split('.').map(Number)
  const pb = b.replace(/^v/i, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y // NaN compara false dos dois lados → não bloqueia
  }
  return false
}

// mínimo efetivo = maior semver entre o mínimo da licença e o global (gates);
// string vazia = sem mínimo daquele lado
export function effectiveMinVersion(licenseMin: string | null, globalMin: string): string | null {
  const a = licenseMin || null
  const b = globalMin || null
  if (!a) return b
  if (!b) return a
  return semverLt(a, b) ? b : a
}

export function appOutdated(minAppVersion: string | null, appVersion?: string): NextResponse | null {
  if (!appVersion || !minAppVersion) return null
  if (semverLt(appVersion, minAppVersion)) {
    return apiError(
      426,
      'ERR_APP_OUTDATED',
      `Versão do aplicativo abaixo da mínima exigida (${minAppVersion}). Baixe a atualização em /download.`,
    )
  }
  return null
}

export const serverTime = () => new Date().toISOString()
