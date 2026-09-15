import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { hmacSign, hmacVerify } from './crypto'
import { db } from './db'
import { env } from './env'

// Resolvedor ÚNICO do instalador (ResyncSetup.exe): última AppVersion ativa
// publicada no canal stable. O arquivo mora em volume persistente e NUNCA em
// URL pública — quem entrega é /download/arquivo, que reconfere direito.
// Checksum NUNCA é inventado.

export interface Installer {
  version: string
  fileName: string
  checksum: string
  sizeBytes: bigint | null
  publishedAt: Date | null
  notes: string | null
}

const normalizeChecksum = (c: string) => c.trim().replace(/^sha256:/i, '').toLowerCase()

export async function getInstaller(): Promise<Installer | null> {
  const v = await db.appVersion.findFirst({
    where: { active: true, channel: 'stable', publishedAt: { not: null } },
    orderBy: { publishedAt: 'desc' },
  })
  if (!v) return null
  return {
    version: v.version,
    fileName: v.fileName,
    checksum: normalizeChecksum(v.checksum),
    sizeBytes: v.sizeBytes,
    publishedAt: v.publishedAt,
    notes: v.notes || null,
  }
}

// ===== arquivo no volume =====

export const INSTALLERS_DIR = env.INSTALLERS_DIR

// Só nome simples: barra, '..' e nome vazio nunca entram no caminho.
export function installerPath(fileName: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(fileName)) return null
  return path.join(INSTALLERS_DIR, fileName)
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

// ===== link assinado de curta duração (API do aplicativo) =====
// Mesma ideia do cookie de 2FA: expiração embutida e assinada, então o link
// não vira URL pública permanente se vazar.

const TOKEN_TTL_MS = 10 * 60_000

export function signInstallerToken(version: string, ttlMs = TOKEN_TTL_MS): string {
  const exp = Date.now() + ttlMs
  return `${exp}.${hmacSign(`installer:${version}:${exp}`, env.AUTH_SECRET)}`
}

export function verifyInstallerToken(version: string, token: string | null): boolean {
  if (!token) return false
  const [expStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false
  return hmacVerify(`installer:${version}:${exp}`, sig, env.AUTH_SECRET)
}
