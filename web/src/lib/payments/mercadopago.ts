import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Order, Payment, User } from '@/generated/prisma/client'
import { db } from '../db'
import { env } from '../env'
import type { CheckoutStart, PaymentProvider, RefundResult, WebhookEvent } from './types'

// Mercado Pago via REST (sem SDK): PIX direto e cartão via Checkout Pro.
// Confirmação SEMPRE pelo webhook assinado — o redirect de volta nunca libera licença.

const API = 'https://api.mercadopago.com'

async function mpFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Mercado Pago ${res.status}: ${body.slice(0, 500)}`)
  }
  return res.json()
}

export const mercadopagoProvider: PaymentProvider = {
  name: 'mercadopago',

  async createCheckout(order: Order, user: User, method): Promise<CheckoutStart> {
    if (!env.MERCADOPAGO_ACCESS_TOKEN)
      throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado — use PAYMENT_PROVIDER=sandbox ou configure a credencial')

    if (method === 'PIX') {
      const mp = await mpFetch('/v1/payments', {
        method: 'POST',
        headers: { 'X-Idempotency-Key': `order-${order.id}` },
        body: JSON.stringify({
          transaction_amount: order.totalCents / 100,
          payment_method_id: 'pix',
          description: `Resync — pedido ${order.id}`,
          external_reference: order.id,
          payer: { email: user.email },
          notification_url: `${env.APP_URL}/api/webhooks/payments`,
        }),
      })
      const tx = mp.point_of_interaction?.transaction_data
      const payment = await db.payment.create({
        data: {
          orderId: order.id,
          provider: 'mercadopago',
          providerPaymentId: String(mp.id),
          method: 'PIX',
          status: 'PENDING',
          amountCents: order.totalCents,
          meta: { pixCopiaECola: tx?.qr_code ?? null, qrCodeBase64: tx?.qr_code_base64 ?? null },
        },
      })
      return {
        payment,
        sandbox: false,
        pix: {
          qrCode: tx?.qr_code ?? '',
          qrCodeBase64: tx?.qr_code_base64 ?? undefined,
          expiresAt: mp.date_of_expiration ?? new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      }
    }

    // Cartão e boleto: Checkout Pro (redirect) — o MP coleta os dados, nós nunca vemos cartão.
    const pref = await mpFetch('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            title: `Resync — pedido ${order.id}`,
            quantity: 1,
            currency_id: order.currency,
            unit_price: order.totalCents / 100,
          },
        ],
        external_reference: order.id,
        back_urls: {
          success: `${env.APP_URL}/painel/pedidos/${order.id}`,
          pending: `${env.APP_URL}/painel/pedidos/${order.id}`,
          failure: `${env.APP_URL}/painel/pedidos/${order.id}`,
        },
        notification_url: `${env.APP_URL}/api/webhooks/payments`,
        payment_methods:
          method === 'BOLETO'
            ? { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }] }
            : undefined,
      }),
    })
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        provider: 'mercadopago',
        providerPaymentId: `pref_${pref.id}`,
        method: method === 'BOLETO' ? 'BOLETO' : 'CARD',
        status: 'PENDING',
        amountCents: order.totalCents,
        meta: { preferenceId: pref.id },
      },
    })
    return { payment, sandbox: false, redirectUrl: pref.init_point }
  },

  // POST /v1/payments/{id}/refunds com X-Idempotency-Key: retry nunca devolve
  // duas vezes. Corpo vazio = reembolso total. NUNCA marcamos REFUNDED aqui —
  // quem decide é o status devolvido pelo provedor (e o webhook posterior).
  async createRefund(payment: Payment, amountCents: number, idempotencyKey: string): Promise<RefundResult> {
    if (!payment.providerPaymentId || payment.providerPaymentId.startsWith('pref_')) {
      return {
        status: 'failed',
        providerRefundId: null,
        response: {},
        error: 'Pagamento sem id real do Mercado Pago — não é possível reembolsar este registro.',
      }
    }
    const isPartial = amountCents < payment.amountCents
    const res = await fetch(`${API}/v1/payments/${payment.providerPaymentId}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(isPartial ? { amount: amountCents / 100 } : {}),
    })
    const body = (await res.json().catch(() => ({}))) as { id?: number; status?: string; message?: string }
    if (!res.ok) {
      return {
        status: 'failed',
        providerRefundId: body.id ? String(body.id) : null,
        response: { httpStatus: res.status, status: body.status ?? null },
        error: `Mercado Pago ${res.status}: ${String(body.message ?? 'reembolso recusado').slice(0, 300)}`,
      }
    }
    const status: RefundResult['status'] = body.status === 'approved' ? 'approved' : 'pending'
    return {
      status,
      providerRefundId: body.id ? String(body.id) : null,
      response: { httpStatus: res.status, status: body.status ?? null, id: body.id ?? null },
    }
  },

  async parseWebhook(rawBody, headers): Promise<WebhookEvent | null> {
    // Assinatura MP: x-signature "ts=...,v1=..." — HMAC do manifesto id/request-id/ts
    const xSignature = headers['x-signature'] ?? ''
    const xRequestId = headers['x-request-id'] ?? ''
    const parts = Object.fromEntries(
      xSignature.split(',').map((p) => p.trim().split('=', 2) as [string, string]),
    )
    let body: { action?: string; type?: string; data?: { id?: string } }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return null
    }
    const dataId = body.data?.id
    if (!dataId || !parts.ts || !parts.v1) return null

    const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId};ts:${parts.ts};`
    const expected = createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(manifest).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(parts.v1)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    if (body.type !== 'payment' && !body.action?.startsWith('payment.')) {
      return { eventId: `${dataId}:${body.action ?? body.type}`, type: 'unknown', providerPaymentId: String(dataId), raw: body }
    }

    // status real vem da API — nunca do corpo do webhook
    const mp = await mpFetch(`/v1/payments/${dataId}`)
    const map: Record<string, WebhookEvent['type']> = {
      approved: 'payment.approved',
      rejected: 'payment.declined',
      cancelled: 'payment.declined',
      refunded: 'payment.refunded',
      charged_back: 'payment.chargeback',
    }
    const type = map[mp.status] ?? 'unknown'
    return {
      // idempotência por transição de estado
      eventId: `${dataId}:${type}`,
      type,
      providerPaymentId: String(dataId),
      raw: {
        webhook: body,
        status: mp.status,
        external_reference: mp.external_reference,
        // dados usados na VALIDAÇÃO do fulfillment — sempre da API, nunca do corpo do webhook
        transaction_amount: mp.transaction_amount ?? null,
        currency_id: mp.currency_id ?? null,
        collector_id: mp.collector_id ?? null,
      },
    }
  },
}
