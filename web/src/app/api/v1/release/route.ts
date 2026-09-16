import { stat } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { installerPath, sha256File } from '@/lib/installer'
import { realIp } from '@/lib/ip'
import { apiError, checkRate, parseBody } from '../_lib'
import { autenticarRelease } from './_auth'

export const dynamic = 'force-dynamic'

// Cria a versão do app e publica, usando a credencial de máquina da esteira.
// É o equivalente automatizado de CRIAR VERSÃO + PUBLICAR no painel, e faz
// exatamente isso: não lê nem escreve licença, pedido, usuário ou repasse.
//
// Duas travas que não se negociam, porque aqui se publica um .exe que as
// pessoas rodam como administrador:
//
// 1. O SHA-256 é recalculado A PARTIR DO ARQUIVO NO VOLUME e comparado com o
//    declarado. Divergiu, nada é salvo — nem que o upload tenha dado certo.
// 2. Número de versão já usado nunca recebe conteúdo diferente. Republicar o
//    mesmo número com outro binário deixaria quem já atualizou com uma versão
//    que o servidor jura ser outra, e o aviso de atualização nunca mais acende.

const corpo = z.object({
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, 'use o formato 1.2.3'),
  channel: z.enum(['stable', 'beta']).default('stable'),
  notes: z.string().trim().min(1, 'descreva o que mudou nesta versão').max(4000),
  fileName: z.string().trim().min(1),
  checksum: z
    .string()
    .trim()
    .transform((v) => v.replace(/^sha256:/i, '').toLowerCase())
    .pipe(z.string().regex(/^[0-9a-f]{64}$/, 'checksum precisa ser o SHA-256 em 64 caracteres hex')),
})

export async function POST(req: NextRequest) {
  const auth = autenticarRelease(req)
  if (auth === 'desligado') return new NextResponse(null, { status: 404 })
  const rl = await checkRate(req, 'release-publish', '', 10)
  if (rl) return rl
  if (auth === 'negado') {
    return apiError(401, 'ERR_RELEASE_TOKEN', 'Credencial de release inválida.')
  }

  const { data, res } = await parseBody(req, corpo)
  if (!data) return res

  const caminho = installerPath(data.fileName)
  if (!caminho) {
    return apiError(
      400,
      'ERR_RELEASE_FILE',
      'Nome de arquivo inválido — use só letras, números, ponto, hífen e sublinhado.',
    )
  }

  let sizeBytes: bigint
  let real: string
  try {
    sizeBytes = BigInt((await stat(caminho)).size)
    real = await sha256File(caminho)
  } catch {
    return apiError(
      404,
      'ERR_RELEASE_FILE',
      `Arquivo ${data.fileName} não está no volume. Envie o instalador em /api/v1/release/upload antes de publicar.`,
    )
  }
  if (real !== data.checksum) {
    return apiError(
      409,
      'ERR_RELEASE_CHECKSUM',
      `Checksum não confere. SHA-256 do arquivo no servidor: ${real}`,
    )
  }

  const existente = await db.appVersion.findUnique({ where: { version: data.version } })
  if (existente && existente.checksum.toLowerCase() !== data.checksum) {
    return apiError(
      409,
      'ERR_RELEASE_VERSION_REUSED',
      `A versão ${data.version} já existe com outro binário. Use um número novo — republicar o mesmo número com conteúdo diferente quebra a atualização de quem já instalou.`,
    )
  }

  const ip = realIp(req.headers)
  const publicada = await db.$transaction(async (tx) => {
    const salva = existente
      ? await tx.appVersion.update({
          where: { id: existente.id },
          data: {
            channel: data.channel,
            notes: data.notes,
            fileName: data.fileName,
            checksum: data.checksum,
            sizeBytes,
            publishedAt: existente.publishedAt ?? new Date(),
            active: true,
          },
        })
      : await tx.appVersion.create({
          data: {
            version: data.version,
            channel: data.channel,
            notes: data.notes,
            fileName: data.fileName,
            checksum: data.checksum,
            sizeBytes,
            publishedAt: new Date(),
            active: true,
          },
        })
    await audit(
      {
        actorUserId: null,
        action: existente ? 'release_api.app_version_republish' : 'release_api.app_version_publish',
        entity: 'appVersion',
        entityId: salva.id,
        before: existente
          ? { publishedAt: existente.publishedAt, active: existente.active }
          : undefined,
        after: {
          version: salva.version,
          channel: salva.channel,
          checksum: salva.checksum,
          sizeBytes: salva.sizeBytes?.toString() ?? null,
        },
        ip,
      },
      tx,
    )
    return salva
  })

  return NextResponse.json({
    version: publicada.version,
    channel: publicada.channel,
    checksum: publicada.checksum,
    sizeBytes: publicada.sizeBytes?.toString() ?? null,
    publishedAt: publicada.publishedAt?.toISOString() ?? null,
    // beta não é entregue em /download: dizer isso evita a pessoa achar que
    // publicou e ficar esperando o aviso de atualização acender.
    noAr: publicada.channel === 'stable',
  })
}
