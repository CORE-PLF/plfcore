import { createPublicKey, verify } from 'node:crypto'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { BRAND } from '@/lib/brand'

// Endpoint de interactions HTTP do Discord (sem gateway): PING + /minhalicenca.
// Verificação ed25519 obrigatória — requisição sem assinatura válida morre em 401.

const EPHEMERAL = 64

const STATUS_LABEL: Record<string, string> = {
  PENDING_ACTIVATION: 'AGUARDANDO ATIVAÇÃO',
  ACTIVE: 'ATIVA',
  EXPIRED: 'EXPIRADA',
  SUSPENDED: 'SUSPENSA',
  REVOKED: 'REVOGADA',
  BLOCKED: 'BLOQUEADA',
  REPLACED: 'SUBSTITUÍDA',
}

function verifySignature(timestamp: string, rawBody: string, signature: string): boolean {
  try {
    const keyObject = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(env.DISCORD_PUBLIC_KEY, 'hex').toString('base64url'),
      },
      format: 'jwk',
    })
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(rawBody, 'utf8')]),
      keyObject,
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return false
  }
}

interface Interaction {
  type: number
  data?: { name?: string }
  member?: { user?: { id?: string } }
  user?: { id?: string }
}

async function licenseContent(discordId: string | undefined): Promise<string> {
  if (!discordId) return 'Não foi possível identificar seu usuário do Discord.'

  const user = await db.user.findUnique({ where: { discordId } })
  if (!user) {
    return [
      `Nenhuma conta ${BRAND.name} vinculada a este Discord.`,
      `Vincule pelo painel: ${env.APP_URL}/painel`,
    ].join('\n')
  }

  const license =
    (await db.license.findFirst({
      where: { userId: user.id, status: { in: ['PENDING_ACTIVATION', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    })) ??
    (await db.license.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    }))
  if (!license) {
    return ['Nenhuma licença nesta conta.', `Planos disponíveis: ${env.APP_URL}/planos`].join('\n')
  }

  const vencida = license.status === 'ACTIVE' && license.expiresAt !== null && license.expiresAt < new Date()
  const status = vencida ? 'EXPIRADA' : (STATUS_LABEL[license.status] ?? license.status)
  const validade = license.expiresAt
    ? `até ${license.expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`
    : license.status === 'PENDING_ACTIVATION'
      ? 'começa a contar na primeira ativação'
      : 'vitalícia'

  // nunca a chave completa — só dados de status + link do painel
  return [
    `LICENÇA — ${BRAND.name}`,
    `Plano: ${license.plan.name}`,
    `Status: ${status}`,
    `Validade: ${validade}`,
    `Painel: ${env.APP_URL}/painel/licenca`,
  ].join('\n')
}

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  const rawBody = await req.text()

  if (!env.DISCORD_PUBLIC_KEY || !signature || !timestamp || !verifySignature(timestamp, rawBody, signature)) {
    return new Response('assinatura inválida', { status: 401 })
  }

  const interaction = JSON.parse(rawBody) as Interaction

  if (interaction.type === 1) return Response.json({ type: 1 }) // PING → PONG

  if (interaction.type === 2 && interaction.data?.name === 'minhalicenca') {
    const discordId = interaction.member?.user?.id ?? interaction.user?.id
    return Response.json({
      type: 4,
      data: { flags: EPHEMERAL, content: await licenseContent(discordId) },
    })
  }

  return Response.json({
    type: 4,
    data: { flags: EPHEMERAL, content: 'Comando não reconhecido.' },
  })
}
