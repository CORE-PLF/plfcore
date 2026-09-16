import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadable } from 'node:stream/web'
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

export const INSTALLER_MAX_BYTES = 200 * 1024 * 1024

export type GravacaoInstalador =
  | { ok: true; fileName: string; sizeBytes: number; sha256: string }
  | { ok: false; status: number; erro: string }

// Grava o instalador no volume em STREAMING e devolve o SHA-256 do que foi
// gravado. Streaming porque server action bufferiza o corpo inteiro em memória e
// não aguenta 200 MB; e o arquivo final só aparece depois de um rename atômico,
// então ninguém baixa um .exe pela metade.
//
// Caminho único de escrita do instalador: o painel e a esteira de release passam
// os dois por aqui. Duplicar validação de nome, teto de tamanho e hash em dois
// lugares é como um dos dois acaba desatualizado.
export async function gravarInstalador(
  nome: string,
  body: ReadableStream<Uint8Array> | null,
  contentLength: number,
): Promise<GravacaoInstalador> {
  const destino = installerPath(nome)
  if (!destino) {
    return {
      ok: false,
      status: 400,
      erro: 'Nome de arquivo inválido — use só letras, números, ponto, hífen e sublinhado.',
    }
  }
  if (contentLength > INSTALLER_MAX_BYTES) {
    return { ok: false, status: 413, erro: 'Arquivo acima de 200 MB.' }
  }
  if (!body) return { ok: false, status: 400, erro: 'Nenhum arquivo recebido.' }

  await mkdir(INSTALLERS_DIR, { recursive: true })
  const hash = createHash('sha256')
  let sizeBytes = 0
  const parcial = `${destino}.parcial`
  try {
    await pipeline(
      Readable.fromWeb(body as NodeWebReadable<Uint8Array>),
      async function* (origem) {
        for await (const bloco of origem) {
          sizeBytes += (bloco as Uint8Array).length
          if (sizeBytes > INSTALLER_MAX_BYTES) throw new Error('GRANDE_DEMAIS')
          hash.update(bloco as Uint8Array)
          yield bloco
        }
      },
      createWriteStream(parcial),
    )
    await rename(parcial, destino)
  } catch (e) {
    await rm(parcial, { force: true })
    return {
      ok: false,
      status: e instanceof Error && e.message === 'GRANDE_DEMAIS' ? 413 : 400,
      erro:
        e instanceof Error && e.message === 'GRANDE_DEMAIS'
          ? 'Arquivo acima de 200 MB.'
          : 'Falha ao gravar o arquivo no volume. Confira o espaço em disco e tente de novo.',
    }
  }
  return { ok: true, fileName: nome, sizeBytes, sha256: hash.digest('hex') }
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
