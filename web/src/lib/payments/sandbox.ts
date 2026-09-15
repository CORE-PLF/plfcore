import type { Order, Payment, User } from '@/generated/prisma/client'
import { db } from '../db'
import { hmacVerify } from '../crypto'
import type { CheckoutStart, PaymentProvider, RefundResult, WebhookEvent } from './types'

// Provedor SANDBOX: fluxo completo e real (pedido → pagamento → webhook assinado
// → licença), sem dinheiro de verdade. O "pagamento" é aprovado via endpoint de
// simulação, que envia um webhook HMAC-assinado ao MESMO caminho de produção.
// Toda superfície de UI que passa por aqui carrega o selo de demonstração.

export const sandboxProvider: PaymentProvider = {
  name: 'sandbox',

  async createCheckout(order: Order, _user: User, method): Promise<CheckoutStart> {
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        provider: 'sandbox',
        providerPaymentId: `sbx_${order.id}`,
        method: method === 'PIX' ? 'PIX' : method === 'BOLETO' ? 'BOLETO' : 'CARD',
        status: 'PENDING',
        amountCents: order.totalCents,
        meta: {
          demo: true,
          pixCopiaECola:
            method === 'PIX' ? `SANDBOX-PIX-DEMONSTRACAO-${order.id}-${order.totalCents}` : null,
        },
      },
    })
    return {
      payment,
      sandbox: true,
      pix:
        method === 'PIX'
          ? {
              qrCode: `SANDBOX-PIX-DEMONSTRACAO-${order.id}-${order.totalCents}`,
              expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
            }
          : undefined,
    }
  },

  // Sandbox aprova o reembolso na hora — todo o resto do fluxo (estados,
  // suspensão de licença, comissão) roda pelo MESMO caminho de produção.
  async createRefund(payment: Payment, amountCents: number, idempotencyKey: string): Promise<RefundResult> {
    return {
      status: 'approved',
      providerRefundId: `sbx_refund_${payment.id}`,
      response: { demo: true, amountCents, idempotencyKey },
    }
  },

  async parseWebhook(rawBody, headers): Promise<WebhookEvent | null> {
    const signature = headers['x-webhook-signature'] ?? ''
    if (!signature || !hmacVerify(rawBody, signature)) return null
    let body: { eventId?: string; type?: string; providerPaymentId?: string }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return null
    }
    if (!body.eventId || !body.providerPaymentId) return null
    const map: Record<string, WebhookEvent['type']> = {
      'payment.approved': 'payment.approved',
      'payment.declined': 'payment.declined',
      'payment.refunded': 'payment.refunded',
      'payment.chargeback': 'payment.chargeback',
    }
    return {
      eventId: body.eventId,
      type: map[body.type ?? ''] ?? 'unknown',
      providerPaymentId: body.providerPaymentId,
      raw: body,
    }
  },
}
