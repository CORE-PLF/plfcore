import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'
import { audit } from './audit'
import { applyRefundEffects } from './fulfillment'
import { getProviderByName } from './payments'
import type { PaymentProvider } from './payments'

// Reembolso REAL: o dinheiro volta pela API do provedor, nunca só no banco.
// Estados: REFUND_PENDING (pedido ao provedor) → REFUNDED (provedor confirmou,
// direto na resposta ou via webhook) | REFUND_FAILED (recusado — admin pode
// tentar de novo). Idempotência: chave estável por pedido — retry no provedor
// nunca devolve duas vezes.

export interface RefundRequestResult {
  ok: boolean
  status: 'REFUNDED' | 'REFUND_PENDING' | 'REFUND_FAILED'
  error?: string
}

export async function requestRefund(
  orderId: string,
  staffUserId: string,
  reason: string,
  // injeção para teste — produção resolve pelo provider do pagamento
  providerOverride?: PaymentProvider,
): Promise<RefundRequestResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } })
  if (!order) return { ok: false, status: 'REFUND_FAILED', error: 'Pedido não encontrado.' }
  if (!['PAID', 'REFUND_FAILED', 'REFUND_PENDING'].includes(order.status))
    return {
      ok: false,
      status: 'REFUND_FAILED',
      error: 'Só pedido PAGO (ou com reembolso pendente/com falha) pode ser reembolsado.',
    }
  const payment = order.payments.find((p) => p.status === 'APPROVED')
  if (!payment)
    return { ok: false, status: 'REFUND_FAILED', error: 'Nenhum pagamento aprovado neste pedido.' }

  const provider = providerOverride ?? getProviderByName(payment.provider)
  if (!provider)
    return { ok: false, status: 'REFUND_FAILED', error: `Provedor desconhecido: ${payment.provider}.` }

  const idempotencyKey = `refund-${order.id}`
  const refund = await db.refund.upsert({
    where: { idempotencyKey },
    create: {
      orderId: order.id,
      paymentId: payment.id,
      provider: payment.provider,
      idempotencyKey,
      amountCents: payment.amountCents,
      reason,
      requestedByUserId: staffUserId,
    },
    // retry depois de FAILED: mesma chave de idempotência, novo estado
    update: { reason, requestedByUserId: staffUserId, status: 'PENDING', error: null },
  })
  await db.order.update({ where: { id: order.id }, data: { status: 'REFUND_PENDING' } })
  await audit({
    actorUserId: staffUserId,
    action: 'admin.refund_request',
    entity: 'order',
    entityId: order.id,
    reason,
    after: { refundId: refund.id, provider: payment.provider, amountCents: payment.amountCents },
  })

  let result
  try {
    result = await provider.createRefund(payment, payment.amountCents, idempotencyKey)
  } catch (err) {
    result = {
      status: 'failed' as const,
      providerRefundId: null,
      response: {},
      error: err instanceof Error ? err.message.slice(0, 500) : 'erro desconhecido no provedor',
    }
  }

  if (result.status === 'failed') {
    const error = result.error ?? 'Reembolso recusado pelo provedor.'
    await db.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: 'FAILED',
          providerRefundId: result.providerRefundId,
          response: result.response as Prisma.InputJsonValue,
          error,
        },
      })
      await tx.order.update({ where: { id: order.id }, data: { status: 'REFUND_FAILED' } })
      await audit(
        { actorUserId: staffUserId, action: 'admin.refund_failed', entity: 'order', entityId: order.id, after: { error } },
        tx,
      )
    })
    return { ok: false, status: 'REFUND_FAILED', error }
  }

  if (result.status === 'pending') {
    // provedor processando — o webhook payment.refunded fecha o ciclo
    await db.refund.update({
      where: { id: refund.id },
      data: { providerRefundId: result.providerRefundId, response: result.response as Prisma.InputJsonValue },
    })
    return { ok: true, status: 'REFUND_PENDING' }
  }

  // aprovado na resposta: aplica os efeitos agora; o webhook posterior é
  // idempotente (fulfillment só confirma o Refund pendente e encerra)
  await db.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: 'APPROVED',
        providerRefundId: result.providerRefundId,
        response: result.response as Prisma.InputJsonValue,
      },
    })
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } })
    await applyRefundEffects(tx, order, { actorUserId: staffUserId, reason })
    await audit(
      {
        actorUserId: staffUserId,
        action: 'admin.refund_approved',
        entity: 'order',
        entityId: order.id,
        after: { providerRefundId: result.providerRefundId },
      },
      tx,
    )
  })
  return { ok: true, status: 'REFUNDED' }
}
