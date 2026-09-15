import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeWebReadable } from 'node:stream/web'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getInstaller, installerPath, verifyInstallerToken } from '@/lib/installer'
import { realIp } from '@/lib/ip'
import { findLiveLicense } from '@/lib/licensing'
import { currentUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

// Entrega ÚNICA do instalador. Duas portas, mesmo direito exigido:
// sessão do site com licença viva, ou token assinado de curta duração emitido
// pela API do aplicativo para quem apresentou chave válida.

function texto(status: number, msg: string) {
  return new NextResponse(msg, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function GET(req: NextRequest) {
  const inst = await getInstaller()
  if (!inst) return texto(404, 'Nenhuma versão publicada no momento. Tente mais tarde.')

  const token = req.nextUrl.searchParams.get('t')
  let userId: string | null = null

  if (token) {
    const versao = req.nextUrl.searchParams.get('v') ?? ''
    if (versao !== inst.version)
      return texto(410, 'Uma versão nova foi publicada. Peça o link de download outra vez pelo aplicativo.')
    if (!verifyInstallerToken(inst.version, token))
      return texto(403, 'Link de download expirado ou inválido. Peça um novo pelo aplicativo.')
  } else {
    const user = await currentUser()
    if (!user) return texto(401, 'Entre na sua conta para baixar o instalador.')
    if (!(await findLiveLicense(user.id)))
      return texto(403, 'Esta conta não tem licença ativa. Escolha um plano em /#planos para baixar o instalador.')
    userId = user.id
  }

  const caminho = installerPath(inst.fileName)
  if (!caminho)
    return texto(500, 'Instalador cadastrado com nome de arquivo inválido. Avise o suporte.')

  let sizeBytes: number
  try {
    sizeBytes = (await stat(caminho)).size
  } catch {
    return texto(503, 'O arquivo do instalador não está disponível no servidor. Avise o suporte.')
  }

  if (userId) {
    const version = await db.appVersion.findUnique({
      where: { version: inst.version },
      select: { id: true },
    })
    if (version)
      await db.download.create({
        data: { userId, appVersionId: version.id, ip: realIp(req.headers) },
      })
  }

  const body = Readable.toWeb(createReadStream(caminho)) as NodeWebReadable<Uint8Array>
  return new NextResponse(body as unknown as ReadableStream<Uint8Array>, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(sizeBytes),
      'content-disposition': `attachment; filename="${inst.fileName}"`,
      'cache-control': 'private, no-store',
    },
  })
}
