import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { audit } from '@/lib/audit'
import { gravarInstalador } from '@/lib/installer'
import { realIp } from '@/lib/ip'
import { apiError, checkRate } from '../../_lib'
import { autenticarRelease } from '../_auth'

export const dynamic = 'force-dynamic'

// Envia o instalador pro volume usando a credencial de máquina da esteira.
// Mesma gravação do painel (`gravarInstalador`): nome validado, teto de 200 MB,
// hash do que foi gravado e rename atômico.
//
// Enviar NÃO publica nada: o arquivo só passa a ser entregue depois que
// POST /api/v1/release criar a versão conferindo este SHA-256.

export async function POST(req: NextRequest) {
  const auth = autenticarRelease(req)
  if (auth === 'desligado') return new NextResponse(null, { status: 404 })
  const rl = await checkRate(req, 'release-upload', '', 10)
  if (rl) return rl
  if (auth === 'negado') {
    return apiError(401, 'ERR_RELEASE_TOKEN', 'Credencial de release inválida.')
  }

  const gravado = await gravarInstalador(
    req.nextUrl.searchParams.get('name') ?? '',
    req.body,
    Number(req.headers.get('content-length') ?? 0),
  )
  if (!gravado.ok) return apiError(gravado.status, 'ERR_RELEASE_UPLOAD', gravado.erro)

  await audit({
    actorUserId: null,
    action: 'release_api.installer_upload',
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
