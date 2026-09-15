import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeWebReadable } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { TOTP_COOKIE, totpCookieValid } from '@/app/admin/totp-cookie'
import { audit } from '@/lib/audit'
import { hasStaffRole } from '@/lib/auth'
import { INSTALLERS_DIR, installerPath } from '@/lib/installer'
import { realIp } from '@/lib/ip'
import { currentUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 200 * 1024 * 1024

// Grava o instalador no volume em STREAMING: server action bufferiza o corpo
// inteiro em memória e não aguenta 200 MB. Devolve o SHA-256 calculado aqui —
// quem confere contra o informado é upsertAppVersionAction.

const erro = (status: number, msg: string) => NextResponse.json({ erro: msg }, { status })

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user || !hasStaffRole(user, 'ADMIN')) return erro(403, 'Sem permissão.')
  const jar = await cookies()
  if (!user.totpSecret || !totpCookieValid(user.id, jar.get(TOTP_COOKIE)?.value))
    return erro(403, 'Sessão de 2FA expirada. Recarregue o painel, refaça a 2FA e envie de novo.')

  const nome = req.nextUrl.searchParams.get('name') ?? ''
  const destino = installerPath(nome)
  if (!destino)
    return erro(400, 'Nome de arquivo inválido — use só letras, números, ponto, hífen e sublinhado.')
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES)
    return erro(413, 'Arquivo acima de 200 MB.')
  if (!req.body) return erro(400, 'Nenhum arquivo recebido.')

  await mkdir(INSTALLERS_DIR, { recursive: true })
  const hash = createHash('sha256')
  let sizeBytes = 0
  const parcial = `${destino}.parcial`
  try {
    await pipeline(
      Readable.fromWeb(req.body as NodeWebReadable<Uint8Array>),
      async function* (origem) {
        for await (const bloco of origem) {
          sizeBytes += (bloco as Uint8Array).length
          if (sizeBytes > MAX_BYTES) throw new Error('GRANDE_DEMAIS')
          hash.update(bloco as Uint8Array)
          yield bloco
        }
      },
      createWriteStream(parcial),
    )
    // troca atômica: o arquivo final só aparece completo
    await rename(parcial, destino)
  } catch (e) {
    await rm(parcial, { force: true })
    return erro(
      400,
      e instanceof Error && e.message === 'GRANDE_DEMAIS'
        ? 'Arquivo acima de 200 MB.'
        : 'Falha ao gravar o arquivo no volume. Confira o espaço em disco e tente de novo.',
    )
  }

  const sha256 = hash.digest('hex')
  await audit({
    actorUserId: user.id,
    action: 'admin.installer_upload',
    entity: 'appVersion',
    after: { fileName: nome, sizeBytes, sha256 },
    ip: realIp(req.headers),
  })
  return NextResponse.json({ fileName: nome, sizeBytes, sha256 })
}
