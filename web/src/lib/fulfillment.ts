import type { Order, Prisma } from '@/generated/prisma/client'
import { db } from './db'
import { audit } from './audit'
import { env } from './env'
import { enqueue } from './jobs'
import { issueOrExtendLicense } from './licensing'
import type { WebhookEvent } from './payments'
import { addCredits } from './resellers'
import { getSettingNumber } from './settings'

// Caminho crítico: webhook validado → pedido pago → licença → notificações.
// Idempotente por (provider, eventId): reentrega, atraso e duplicata são seguros.

// Efeitos do reembolso/chargeback — usados pelo webhook E pelo fluxo
// administrativo (lib/refunds). Ordem REFUNDED, licença suspensa, comissão
// cancelada, Refund pendente confirmado, cliente notificado.
export async function applyRefundEffects(
  tx: Prisma.TransactionClient,
  order: Pick<Order, 'id' | 'userId'>,
  opts: { chargeback?: boolean; actorUserId?: string | null; reason?: string | null } = {},
): Promise<void> {
  const isCb = opts.chargeback === true
  await tx.order.update({
    where: { id: order.id },
    data: { status: isCb ? 'CHARGEBACK' : 'REFUNDED' },
  })
  const license = await tx.license.findUnique({ where: { orderId: order.id } })
  if (license && (license.status === 'ACTIVE' || license.status === 'PENDING_ACTIVATION')) {
    await tx.license.update({ where: { id: license.id }, data: { status: 'SUSPENDED' } })
    await tx.licenseEvent.create({
      data: {
        licenseId: license.id,
        type: isCb ? 'SUSPENDED_CHARGEBACK' : 'SUSPENDED_REFUND',
        actorUserId: opts.actorUserId ?? null,
        meta: opts.reason ? { orderId: order.id, reason: opts.reason } : { orderId: order.id },
      },
    })
  }
  await tx.commission.updateMany({
    where: { orderId: order.id, status: { in: ['PENDING', 'APPROVED'] } },
    data: { status: 'CANCELLED' },
  })
  await tx.refund.updateMany({
    where: { orderId: order.id, status: 'PENDING' },
    data: { status: 'APPROVED' },
  })
  await tx.notification.create({
    data: {
      userId: order.userId,
      type: isCb ? 'chargeback' : 'refund_confirmed',
      title: isCb ? 'CHARGEBACK REGISTRADO' : 'REEMBOLSO CONFIRMADO',
      body: isCb
        ? 'Recebemos um chargeback deste pedido. A licença associada foi suspensa.'
        : 'O reembolso do pedido foi confirmado. A licença associada foi suspensa.',
    },
  })
}

export async function processPaymentEvent(
  providerName: string,
  event: WebhookEvent,
): Promise<{ ok: boolean; skipped?: string }> {
  // registro do evento ANTES de processar — se já existe processado, é replay
  const existing = await db.paymentEvent.findUnique({
    where: { provider_eventId: { provider: providerName, eventId: event.eventId } },
  })
  if (existing?.processedAt) return { ok: true, skipped: 'evento já processado' }

  const record =
    existing ??
    (await db.paymentEvent.create({
      data: {
        provider: providerName,
        eventId: event.eventId,
        type: event.type,
        payload: event.raw as object,
        signatureValid: true,
      },
    }))

  if (event.type === 'unknown') {
    await db.paymentEvent.update({ where: { id: record.id }, data: { processedAt: new Date() } })
    return { ok: true, skipped: 'tipo de evento ignorado' }
  }

  // localizar o pagamento; checkout externo pode gerar id novo → resolve pelo external_reference
  let payment = await db.payment.findUnique({
    where: { provider_providerPaymentId: { provider: providerName, providerPaymentId: event.providerPaymentId } },
    include: { order: true },
  })
  if (!payment) {
    const raw = event.raw as { external_reference?: string }
    const orderId = raw?.external_reference
    const order = orderId ? await db.order.findUnique({ where: { id: orderId } }) : null
    if (!order) {
      await db.paymentEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date(), error: 'pagamento/pedido não encontrado' },
      })
      return { ok: false, skipped: 'pedido não encontrado' }
    }
    payment = await db.payment
      .create({
        data: {
          orderId: order.id,
          provider: providerName,
          providerPaymentId: event.providerPaymentId,
          method: 'CARD',
          status: 'PENDING',
          amountCents: order.totalCents,
        },
        include: { order: true },
      })
  }

  const order = payment.order

  try {
    await db.$transaction(async (tx) => {
      if (event.type === 'payment.approved') {
        // fora de ordem: aprovado depois de reembolso não "des-reembolsa";
        // REFUND_* implica pedido já pago — replay de aprovado não refaz nada
        if (['REFUNDED', 'CHARGEBACK', 'PAID', 'REFUND_PENDING', 'REFUND_FAILED'].includes(order.status)) {
          await tx.paymentEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), paymentId: payment.id } })
          return
        }

        // Validação financeira: valor, moeda e conta recebedora vêm da API do
        // provedor (nunca do corpo do webhook). Divergência = pedido em análise,
        // SEM licença — dinheiro errado nunca vira entrega.
        const fin = event.raw as {
          transaction_amount?: number | null
          currency_id?: string | null
          collector_id?: number | string | null
        } | null
        const paidCents =
          typeof fin?.transaction_amount === 'number'
            ? Math.round(fin.transaction_amount * 100)
            : payment.amountCents
        const currency = typeof fin?.currency_id === 'string' ? fin.currency_id : order.currency
        const collectorOk =
          !env.MERCADOPAGO_COLLECTOR_ID ||
          fin?.collector_id == null ||
          String(fin.collector_id) === env.MERCADOPAGO_COLLECTOR_ID
        if (paidCents !== order.totalCents || currency !== order.currency || !collectorOk) {
          const motivo = !collectorOk
            ? `conta recebedora divergente (${fin?.collector_id})`
            : `valor/moeda divergente: pago ${paidCents} ${currency}, esperado ${order.totalCents} ${order.currency}`
          await tx.order.update({ where: { id: order.id }, data: { status: 'IN_REVIEW' } })
          await tx.paymentEvent.update({
            where: { id: record.id },
            data: { processedAt: new Date(), paymentId: payment.id, error: `não processado: ${motivo}` },
          })
          await audit(
            { action: 'payment.mismatch', entity: 'order', entityId: order.id, after: { motivo, eventId: event.eventId } },
            tx,
          )
          return
        }

        await tx.payment.update({ where: { id: payment.id }, data: { status: 'APPROVED' } })
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID', paidAt: new Date(), provider: providerName, providerRef: event.providerPaymentId },
        })

        const plan = await tx.plan.findUniqueOrThrow({
          where: { id: order.planId },
          include: { product: true },
        })

        // pedido de PACK DE CRÉDITOS (revendedor): credita o ledger em vez de emitir licença
        if (plan.product.slug === 'creditos') {
          const reseller = await tx.reseller.findUnique({ where: { userId: order.userId } })
          if (!reseller) throw new Error('Pedido de créditos sem conta de revendedor.')
          const features = plan.features as { creditCents?: number } | string[]
          const creditCents =
            !Array.isArray(features) && features.creditCents ? features.creditCents : order.subtotalCents
          await addCredits(
            reseller.id,
            creditCents,
            { type: 'CREDIT_PURCHASE', refOrderId: order.id, note: `Pack ${plan.name}` },
            tx,
          )
          await enqueue('email.send', { template: 'credits_added', userId: order.userId, orderId: order.id }, {}, tx)
          await tx.notification.create({
            data: {
              userId: order.userId,
              type: 'credits_added',
              title: 'CRÉDITOS ADICIONADOS',
              body: 'O pagamento foi confirmado e os créditos já estão no seu saldo de revenda.',
            },
          })
          await tx.paymentEvent.update({
            where: { id: record.id },
            data: { processedAt: new Date(), paymentId: payment.id },
          })
          await audit(
            { action: 'payment.approved_credits', entity: 'order', entityId: order.id, after: { creditCents } },
            tx,
          )
          return
        }

        const issued = await issueOrExtendLicense(tx, {
          userId: order.userId,
          plan,
          orderId: order.id,
          intent: order.licenseIntent,
        })

        if (order.couponId) {
          await tx.couponRedemption.upsert({
            where: { orderId: order.id },
            create: { couponId: order.couponId, userId: order.userId, orderId: order.id },
            update: {},
          })
        }

        if (order.affiliateId) {
          const affiliate = await tx.affiliate.findUnique({ where: { id: order.affiliateId } })
          if (affiliate && affiliate.status === 'APPROVED' && affiliate.userId !== order.userId) {
            const windowDays = await getSettingNumber('refund_window_days', 7, tx)
            const amount = Math.floor((order.totalCents * affiliate.commissionBps) / 10000)
            await tx.commission.upsert({
              where: { orderId: order.id },
              create: {
                affiliateId: affiliate.id,
                orderId: order.id,
                amountCents: amount,
                status: 'PENDING',
                approvesAt: new Date(Date.now() + windowDays * 86400_000),
              },
              update: {},
            })
          }
        }

        await enqueue('discord.dm_purchase', { userId: order.userId, orderId: order.id, licenseId: issued.license.id }, {}, tx)
        await enqueue('email.send', { template: 'purchase_confirmed', userId: order.userId, orderId: order.id }, {}, tx)
        await tx.notification.create({
          data: {
            userId: order.userId,
            type: 'payment_approved',
            title: 'PAGAMENTO CONFIRMADO',
            body: issued.extended
              ? 'Sua licença foi estendida. O novo prazo já vale.'
              : 'Sua licença está disponível no painel. Baixe o aplicativo e ative.',
          },
        })
        await audit(
          { action: 'payment.approved', entity: 'order', entityId: order.id, after: { paymentId: payment.id, licenseId: issued.license.id } },
          tx,
        )
      }

      if (event.type === 'payment.declined') {
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'DECLINED' } })
        if (order.status === 'PENDING' || order.status === 'AWAITING_PAYMENT') {
          await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
        }
        await audit({ action: 'payment.declined', entity: 'order', entityId: order.id }, tx)
      }

      if (event.type === 'payment.refunded' || event.type === 'payment.chargeback') {
        const isChargeback = event.type === 'payment.chargeback'
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: isChargeback ? 'CHARGEBACK' : 'REFUNDED' },
        })
        // reembolso iniciado pelo admin já aplicou os efeitos — webhook só confirma
        if (order.status === 'REFUNDED' || order.status === 'CHARGEBACK') {
          await tx.refund.updateMany({
            where: { orderId: order.id, status: 'PENDING' },
            data: { status: 'APPROVED' },
          })
          await tx.paymentEvent.update({
            where: { id: record.id },
            data: { processedAt: new Date(), paymentId: payment.id },
          })
          return
        }
        await applyRefundEffects(tx, order, { chargeback: isChargeback })
        await audit(
          { action: isChargeback ? 'payment.chargeback' : 'payment.refunded', entity: 'order', entityId: order.id },
          tx,
        )
      }

      await tx.paymentEvent.update({
        where: { id: record.id },
        data: { processedAt: new Date(), paymentId: payment.id },
      })
    })
    return { ok: true }
  } catch (err) {
    await db.paymentEvent.update({
      where: { id: record.id },
      data: { error: err instanceof Error ? err.message.slice(0, 2000) : 'erro desconhecido' },
    })
    throw err
  }
}
