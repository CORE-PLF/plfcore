import { describe, expect, test } from 'vitest'
import { attachAttribution } from '@/lib/affiliates'
import { createOrder } from '@/lib/checkout'
import { db } from '@/lib/db'
import { processPaymentEvent } from '@/lib/fulfillment'
import type { WebhookEvent } from '@/lib/payments'
import { createUser, uniq } from './helpers'

function evt(type: WebhookEvent['type'], providerPaymentId: string, eventId = uniq('evt')): WebhookEvent {
  return { eventId, type, providerPaymentId, raw: {} }
}

// pedido AWAITING_PAYMENT + pagamento sandbox PENDING, direto no banco
async function makePendingOrder(userId: string) {
  const order = await createOrder(userId, 'mensal')
  const providerPaymentId = uniq('pp')
  await db.payment.create({
    data: {
      orderId: order.id,
      provider: 'sandbox',
      providerPaymentId,
      method: 'SANDBOX',
      status: 'PENDING',
      amountCents: order.totalCents,
    },
  })
  return { order, providerPaymentId }
}

async function makeAffiliate() {
  const user = await createUser('afiliado')
  return db.affiliate.create({
    data: { userId: user.id, code: uniq('AFF').toUpperCase(), status: 'APPROVED', commissionBps: 1500 },
  })
}

describe('processPaymentEvent', () => {
  test('payment.approved: pedido PAID, licença, notificação, job e comissão', async () => {
    const buyer = await createUser('comprador')
    const affiliate = await makeAffiliate()
    await attachAttribution(buyer.id, affiliate.code)
    const { order, providerPaymentId } = await makePendingOrder(buyer.id)
    expect(order.affiliateId).toBe(affiliate.id)

    const t0 = new Date(Date.now() - 1000)
    const res = await processPaymentEvent('sandbox', evt('payment.approved', providerPaymentId))
    expect(res.ok).toBe(true)
    expect(res.skipped).toBeUndefined()

    const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(paid.status).toBe('PAID')
    expect(paid.paidAt).not.toBeNull()

    const license = await db.license.findUnique({ where: { orderId: order.id } })
    expect(license).not.toBeNull()
    expect(license!.status).toBe('PENDING_ACTIVATION')
    expect(license!.keyHash).toMatch(/^[0-9a-f]{64}$/)

    const notif = await db.notification.findFirst({
      where: { userId: buyer.id, type: 'payment_approved' },
    })
    expect(notif).not.toBeNull()

    const jobs = await db.job.findMany({
      where: { type: 'discord.dm_purchase', createdAt: { gte: t0 } },
    })
    const mine = jobs.filter((j) => (j.payload as { orderId?: string }).orderId === order.id)
    expect(mine).toHaveLength(1)

    const commission = await db.commission.findUnique({ where: { orderId: order.id } })
    expect(commission).not.toBeNull()
    expect(commission!.affiliateId).toBe(affiliate.id)
    expect(commission!.status).toBe('PENDING')
    expect(commission!.amountCents).toBe(Math.floor((order.totalCents * 1500) / 10000))
  })

  test('REPLAY do mesmo eventId: skipped e nada duplicado', async () => {
    const buyer = await createUser('replay')
    const affiliate = await makeAffiliate()
    await attachAttribution(buyer.id, affiliate.code)
    const { order, providerPaymentId } = await makePendingOrder(buyer.id)

    const eventId = uniq('evt')
    const first = await processPaymentEvent('sandbox', evt('payment.approved', providerPaymentId, eventId))
    expect(first.ok).toBe(true)

    const replay = await processPaymentEvent('sandbox', evt('payment.approved', providerPaymentId, eventId))
    expect(replay.ok).toBe(true)
    expect(replay.skipped).toBeTruthy()

    expect(await db.license.count({ where: { userId: buyer.id } })).toBe(1)
    expect(await db.commission.count({ where: { orderId: order.id } })).toBe(1)
    expect(await db.notification.count({ where: { userId: buyer.id, type: 'payment_approved' } })).toBe(1)
    const jobs = await db.job.findMany({ where: { type: 'discord.dm_purchase' } })
    expect(jobs.filter((j) => (j.payload as { orderId?: string }).orderId === order.id)).toHaveLength(1)
  })

  test('payment.refunded: pedido REFUNDED, licença SUSPENDED, comissão CANCELLED', async () => {
    const buyer = await createUser('reembolso')
    const affiliate = await makeAffiliate()
    await attachAttribution(buyer.id, affiliate.code)
    const { order, providerPaymentId } = await makePendingOrder(buyer.id)

    await processPaymentEvent('sandbox', evt('payment.approved', providerPaymentId))
    await processPaymentEvent('sandbox', evt('payment.refunded', providerPaymentId))

    const refunded = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(refunded.status).toBe('REFUNDED')

    const license = await db.license.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(license.status).toBe('SUSPENDED')

    const commission = await db.commission.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(commission.status).toBe('CANCELLED')
  })

  test('fora de ordem: refunded seguido de approved NÃO volta a PAID', async () => {
    const buyer = await createUser('fora-ordem')
    const { order, providerPaymentId } = await makePendingOrder(buyer.id)

    await processPaymentEvent('sandbox', evt('payment.refunded', providerPaymentId))
    let saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUNDED')

    await processPaymentEvent('sandbox', evt('payment.approved', providerPaymentId))
    saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUNDED')
    // e nenhuma licença foi emitida pro pedido reembolsado
    expect(await db.license.findUnique({ where: { orderId: order.id } })).toBeNull()
  })
})
