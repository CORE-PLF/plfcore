import { describe, expect, test } from 'vitest'
import { createOrder } from '@/lib/checkout'
import { db } from '@/lib/db'
import { processPaymentEvent } from '@/lib/fulfillment'
import type { PaymentProvider, WebhookEvent } from '@/lib/payments'
import { requestRefund } from '@/lib/refunds'
import { createUser, uniq } from './helpers'

function evt(type: WebhookEvent['type'], providerPaymentId: string, raw: object = {}): WebhookEvent {
  return { eventId: uniq('evt'), type, providerPaymentId, raw }
}

async function makePaidOrder(userId: string) {
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
  const res = await processPaymentEvent('sandbox', evt('payment.approved', providerPaymentId))
  expect(res.ok).toBe(true)
  return { order, providerPaymentId }
}

// provedor fake para caminhos que o sandbox real não produz (falha / pendente)
function fakeProvider(refund: Awaited<ReturnType<PaymentProvider['createRefund']>>): PaymentProvider {
  return {
    name: 'sandbox',
    createCheckout: () => Promise.reject(new Error('não usado no teste')),
    parseWebhook: () => Promise.resolve(null),
    createRefund: () => Promise.resolve(refund),
  }
}

describe('requestRefund (reembolso real)', () => {
  test('aprovado pelo provedor: REFUNDED, licença SUSPENDED, comissão irrelevante, Refund APPROVED', async () => {
    const buyer = await createUser('refund-ok')
    const staff = await createUser('staff')
    const { order } = await makePaidOrder(buyer.id)

    const res = await requestRefund(order.id, staff.id, 'teste de reembolso aprovado')
    expect(res).toEqual({ ok: true, status: 'REFUNDED' })

    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUNDED')

    const license = await db.license.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(license.status).toBe('SUSPENDED')

    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } })
    expect(payment.status).toBe('REFUNDED')

    const refund = await db.refund.findUniqueOrThrow({ where: { idempotencyKey: `refund-${order.id}` } })
    expect(refund.status).toBe('APPROVED')
    expect(refund.providerRefundId).toContain('sbx_refund_')
    expect(refund.requestedByUserId).toBe(staff.id)

    const notif = await db.notification.count({ where: { userId: buyer.id, type: 'refund_confirmed' } })
    expect(notif).toBe(1)
  })

  test('provedor recusa: REFUND_FAILED com erro; retry aprovado reusa a MESMA chave de idempotência', async () => {
    const buyer = await createUser('refund-fail')
    const staff = await createUser('staff2')
    const { order } = await makePaidOrder(buyer.id)

    const fail = await requestRefund(
      order.id,
      staff.id,
      'primeira tentativa',
      fakeProvider({ status: 'failed', providerRefundId: null, response: {}, error: 'saldo insuficiente na conta MP' }),
    )
    expect(fail.ok).toBe(false)
    expect(fail.status).toBe('REFUND_FAILED')
    expect(fail.error).toContain('saldo insuficiente')

    let saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUND_FAILED')
    // licença NÃO suspensa em falha — o dinheiro não voltou
    const license = await db.license.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(license.status).toBe('PENDING_ACTIVATION')

    const retry = await requestRefund(order.id, staff.id, 'segunda tentativa')
    expect(retry).toEqual({ ok: true, status: 'REFUNDED' })
    saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUNDED')

    // uma única linha de Refund por pedido (idempotência), atualizada no retry
    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(1)
  })

  test('provedor pendente: REFUND_PENDING; webhook payment.refunded conclui e confirma o Refund', async () => {
    const buyer = await createUser('refund-pend')
    const staff = await createUser('staff3')
    const { order, providerPaymentId } = await makePaidOrder(buyer.id)

    const res = await requestRefund(
      order.id,
      staff.id,
      'reembolso assíncrono',
      fakeProvider({ status: 'pending', providerRefundId: 'mp_ref_1', response: { status: 'in_process' } }),
    )
    expect(res).toEqual({ ok: true, status: 'REFUND_PENDING' })

    let saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUND_PENDING')

    await processPaymentEvent('sandbox', evt('payment.refunded', providerPaymentId))
    saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUNDED')

    const refund = await db.refund.findUniqueOrThrow({ where: { idempotencyKey: `refund-${order.id}` } })
    expect(refund.status).toBe('APPROVED')
    const license = await db.license.findUniqueOrThrow({ where: { orderId: order.id } })
    expect(license.status).toBe('SUSPENDED')
  })

  test('webhook de reembolso DEPOIS do reembolso admin não duplica efeitos', async () => {
    const buyer = await createUser('refund-dup')
    const staff = await createUser('staff4')
    const { order, providerPaymentId } = await makePaidOrder(buyer.id)

    await requestRefund(order.id, staff.id, 'reembolso direto')
    await processPaymentEvent('sandbox', evt('payment.refunded', providerPaymentId))

    expect(await db.notification.count({ where: { userId: buyer.id, type: 'refund_confirmed' } })).toBe(1)
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('REFUNDED')
  })

  test('pedido não pago: recusa sem tocar o provedor', async () => {
    const buyer = await createUser('refund-unpaid')
    const staff = await createUser('staff5')
    const order = await createOrder(buyer.id, 'mensal')

    const res = await requestRefund(order.id, staff.id, 'não deveria rodar')
    expect(res.ok).toBe(false)
    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(0)
  })
})

describe('validação financeira do webhook aprovado', () => {
  test('valor divergente: pedido vai para IN_REVIEW, SEM licença, evento com erro', async () => {
    const buyer = await createUser('valor-errado')
    const order = await createOrder(buyer.id, 'mensal')
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

    const wrong = evt('payment.approved', providerPaymentId, {
      transaction_amount: (order.totalCents - 100) / 100, // pagou 1 real a menos
      currency_id: order.currency,
    })
    await processPaymentEvent('sandbox', wrong)

    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('IN_REVIEW')
    expect(await db.license.findUnique({ where: { orderId: order.id } })).toBeNull()

    const record = await db.paymentEvent.findUniqueOrThrow({
      where: { provider_eventId: { provider: 'sandbox', eventId: wrong.eventId } },
    })
    expect(record.error).toContain('divergente')
  })

  test('moeda divergente também bloqueia', async () => {
    const buyer = await createUser('moeda-errada')
    const order = await createOrder(buyer.id, 'mensal')
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

    await processPaymentEvent(
      'sandbox',
      evt('payment.approved', providerPaymentId, {
        transaction_amount: order.totalCents / 100,
        currency_id: 'USD',
      }),
    )

    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.status).toBe('IN_REVIEW')
    expect(await db.license.findUnique({ where: { orderId: order.id } })).toBeNull()
  })
})
