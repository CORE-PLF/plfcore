import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { addGuildRole, deliverPurchaseDm, removeGuildRole, sendDm } from '@/lib/discord'
import { discordConfigured, env } from '@/lib/env'
import { enqueue, type JobType } from '@/lib/jobs'
import { getSetting } from '@/lib/settings'
import { hmacSign } from '@/lib/crypto'
import { formatCents } from '@/lib/money'
import { cleanupRateLimitBuckets } from '@/lib/ratelimit'
import { assertPublicHttpsUrl } from '@/lib/ssrf'
import { BRAND } from '@/lib/brand'
import { sendTemplateEmail } from './emails'

export type Handler = (payload: Record<string, unknown>) => Promise<void>

function need(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  if (typeof v !== 'string' || !v) throw new Error(`payload sem campo obrigatório: ${key}`)
  return v
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : 'erro'
}

// ===== discord =====

async function dmPurchase(payload: Record<string, unknown>): Promise<void> {
  await deliverPurchaseDm(need(payload, 'userId'), need(payload, 'orderId'), need(payload, 'licenseId'))
}

// Falha de DM nunca vira retry infinito: painel é o canal principal.
async function dmExpiryWarning(payload: Record<string, unknown>): Promise<void> {
  const userId = need(payload, 'userId')
  const licenseId = need(payload, 'licenseId')
  const [user, license] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.license.findUnique({ where: { id: licenseId } }),
  ])
  const delivery = await db.discordDelivery.create({
    data: { userId, kind: 'dm_expiry_warning', licenseId, status: 'PENDING' },
  })
  if (!discordConfigured() || !env.DISCORD_BOT_TOKEN || !user?.discordId) {
    await db.discordDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', error: user?.discordId ? 'bot não configurado' : 'Discord não vinculado' },
    })
    return
  }
  const days = license?.expiresAt
    ? Math.max(1, Math.ceil((license.expiresAt.getTime() - Date.now()) / 86400_000))
    : null
  try {
    await sendDm(
      user.discordId,
      [
        `AVISO DE VENCIMENTO — ${BRAND.name}`,
        days !== null ? `Sua licença vence em ${days} dia${days === 1 ? '' : 's'}.` : 'Sua licença está próxima do vencimento.',
        `Renove pelo painel: ${env.APP_URL}/painel/licenca`,
      ].join('\n'),
    )
    await db.discordDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT' } })
  } catch (err) {
    await db.discordDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', error: errMsg(err) } })
  }
}

async function roleSync(payload: Record<string, unknown>): Promise<void> {
  const userId = need(payload, 'userId')
  const action = payload.action === 'remove' ? 'remove' : 'add'
  const roleId = await getSetting('discord_role_cliente', '')
  if (!roleId || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return // sem cargo/bot configurado — nada a sincronizar
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user?.discordId) return
  if (action === 'add') await addGuildRole(user.discordId, roleId)
  else await removeGuildRole(user.discordId, roleId)
}

// ===== e-mail =====

async function emailSend(payload: Record<string, unknown>): Promise<void> {
  await sendTemplateEmail(payload)
}

// ===== webhook de revendedor =====

// Assinatura: header x-signature = HMAC-SHA256 (hex) do corpo bruto com o webhookSecret.
// ponytail: uma linha de WebhookDelivery por tentativa — trilha de entrega; retry fica no job.
async function resellerWebhook(payload: Record<string, unknown>): Promise<void> {
  const resellerId = need(payload, 'resellerId')
  const event = need(payload, 'event')
  const data = (payload.data ?? {}) as Record<string, unknown>
  const reseller = await db.reseller.findUnique({ where: { id: resellerId } })
  if (!reseller) throw new Error(`revendedor não encontrado: ${resellerId}`)
  if (!reseller.webhookUrl || !reseller.webhookSecret) return // webhook não configurado — nada a entregar

  const body = JSON.stringify({ event, data, sentAt: new Date().toISOString() })
  const delivery = await db.webhookDelivery.create({
    data: { resellerId, event, payload: data as Prisma.InputJsonValue, status: 'PENDING' },
  })
  try {
    // anti-SSRF: revalida a URL a cada entrega — o DNS pode ter mudado desde o cadastro
    await assertPublicHttpsUrl(reseller.webhookUrl)
    const res = await fetch(reseller.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': hmacSign(body, reseller.webhookSecret) },
      body,
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) throw new Error('redirect não permitido no webhook de revenda')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'SENT', attempts: 1, lastAttemptAt: new Date() },
    })
  } catch (err) {
    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', attempts: 1, lastAttemptAt: new Date() },
    })
    throw err // o job faz o retry com backoff
  }
}

// ===== sweeps =====

// O scheduler evita sweeps concorrentes (não enfileira havendo PENDING do mesmo
// tipo) e o claim é atômico; os updateMany condicionais são a segunda trava.
async function licensesExpireSweep(): Promise<void> {
  const now = new Date()

  const expired = await db.license.findMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    take: 500,
  })
  for (const license of expired) {
    await db.$transaction(async (tx) => {
      const updated = await tx.license.updateMany({
        where: { id: license.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      })
      if (updated.count !== 1) return
      await tx.licenseEvent.create({
        data: { licenseId: license.id, type: 'EXPIRED', meta: { expiresAt: license.expiresAt } },
      })
      await tx.notification.create({
        data: {
          userId: license.userId,
          type: 'license_expired',
          title: 'LICENÇA EXPIRADA',
          body: 'Sua licença expirou. Renove pelo painel para voltar a usar o aplicativo.',
        },
      })
    })
  }

  const soon = new Date(now.getTime() + 3 * 86400_000)
  const expiring = await db.license.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { gte: now, lte: soon },
      events: { none: { type: 'EXPIRY_WARNED' } },
    },
    take: 500,
  })
  for (const license of expiring) {
    await db.$transaction(async (tx) => {
      const already = await tx.licenseEvent.findFirst({
        where: { licenseId: license.id, type: 'EXPIRY_WARNED' },
      })
      if (already) return
      await tx.licenseEvent.create({
        data: { licenseId: license.id, type: 'EXPIRY_WARNED', meta: { expiresAt: license.expiresAt } },
      })
      await enqueue('discord.dm_expiry_warning', { userId: license.userId, licenseId: license.id }, {}, tx)
      await enqueue('email.send', { template: 'expiry_warning', userId: license.userId, licenseId: license.id }, {}, tx)
      const days = license.expiresAt
        ? Math.max(1, Math.ceil((license.expiresAt.getTime() - now.getTime()) / 86400_000))
        : 3
      await tx.notification.create({
        data: {
          userId: license.userId,
          type: 'license_expiry_warning',
          title: 'LICENÇA PERTO DE VENCER',
          body: `Sua licença vence em ${days} dia${days === 1 ? '' : 's'}. Renove pelo painel para não perder o acesso.`,
        },
      })
    })
  }
}

async function commissionsApproveSweep(): Promise<void> {
  const due = await db.commission.findMany({
    where: {
      status: 'PENDING',
      approvesAt: { lte: new Date() },
      order: { status: { notIn: ['REFUNDED', 'CHARGEBACK'] } },
    },
    include: { affiliate: true },
    take: 500,
  })
  for (const commission of due) {
    await db.$transaction(async (tx) => {
      const updated = await tx.commission.updateMany({
        where: { id: commission.id, status: 'PENDING' },
        data: { status: 'APPROVED' },
      })
      if (updated.count !== 1) return
      await tx.notification.create({
        data: {
          userId: commission.affiliate.userId,
          type: 'commission_approved',
          title: 'COMISSÃO APROVADA',
          body: `Comissão de ${formatCents(commission.amountCents)} aprovada e disponível para saque.`,
        },
      })
    })
  }
}

// Limpeza de dados vencidos: sessões mortas há 30d, buckets de rate limit
// vencidos e jobs DONE com mais de 7d. Auditoria e trilhas de entrega ficam.
async function systemCleanupSweep(): Promise<void> {
  const now = Date.now()
  const cutoff30d = new Date(now - 30 * 86400_000)
  const sessions = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff30d } }, { revokedAt: { lt: cutoff30d } }] },
  })
  const buckets = await cleanupRateLimitBuckets()
  const jobs = await db.job.deleteMany({
    where: { status: 'DONE', updatedAt: { lt: new Date(now - 7 * 86400_000) } },
  })
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    evt: 'cleanup_sweep',
    sessions: sessions.count,
    rateLimitBuckets: buckets,
    doneJobs: jobs.count,
  }))
}

export const handlers: Record<JobType, Handler> = {
  'discord.dm_purchase': dmPurchase,
  'discord.dm_expiry_warning': dmExpiryWarning,
  'discord.role_sync': roleSync,
  'email.send': emailSend,
  'reseller.webhook': resellerWebhook,
  'licenses.expire_sweep': licensesExpireSweep,
  'commissions.approve_sweep': commissionsApproveSweep,
  'system.cleanup_sweep': systemCleanupSweep,
}
