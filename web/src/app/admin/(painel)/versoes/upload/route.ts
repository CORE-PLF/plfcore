import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { TOTP_COOKIE, totpCookieValid } from '@/app/admin/totp-cookie'
import { audit } from '@/lib/audit'
import { hasStaffRole } from '@/lib/auth'
import { gravarInstalador } from '@/lib/installer'
import { realIp } from '@/lib/ip'
import { currentUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Envia o instalador pro volume. A gravação em si (validação de nome, teto de
// tamanho, hash e rename atômico) mora em `gravarInstalador` — mesma rotina que
// a esteira de release usa. Quem confere o SHA-256 contra o informado é
// upsertAppVersionAction.

const erro = (status: number, msg: string) => NextResponse.json({ erro: msg }, { status })

export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user || !hasStaffRole(user, 'ADMIN')) return erro(403, 'Sem permissão.')
  const jar = await cookies()
  if (!user.totpSecret || !totpCookieValid(user.id, jar.get(TOTP_COOKIE)?.value))
    return erro(403, 'Sessão de 2FA expirada. Recarregue o painel, refaça a 2FA e envie de novo.')

  const gravado = await gravarInstalador(
    req.nextUrl.searchParams.get('name') ?? '',
    req.body,
    Number(req.headers.get('content-length') ?? 0),
  )
  if (!gravado.ok) return erro(gravado.status, gravado.erro)

  await audit({
    actorUserId: user.id,
    action: 'admin.installer_upload',
    entity: 'appVersion',
    after: { fileName: gravado.fileName, sizeBytes: gravado.sizeBytes, sha256: gravado.sha256 },
    ip: realIp(req.headers),
  })
  return NextResponse.json({
    fileName: gravado.fileName,
    sizeBytes: gravado.sizeBytes,
    sha256: gravado.sha256,
  })
}
