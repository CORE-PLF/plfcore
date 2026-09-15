import type { Order, Payment, User } from '@/generated/prisma/client'

export interface CheckoutStart {
  payment: Payment
  // como o cliente paga: redirect (cartão/checkout externo) ou dados PIX inline
  redirectUrl?: string
  pix?: { qrCode: string; qrCodeBase64?: string; expiresAt: string }
  boletoUrl?: string
  // true quando o provedor é o sandbox — a UI exibe o selo de demonstração
  sandbox: boolean
}

export interface WebhookEvent {
  // id único do evento no provedor (idempotência)
  eventId: string
  type: 'payment.approved' | 'payment.declined' | 'payment.refunded' | 'payment.chargeback' | 'unknown'
  providerPaymentId: string
  raw: unknown
}

// Resultado do reembolso NO PROVEDOR. 'approved' = dinheiro devolvido de
// verdade; 'pending' = provedor processando (webhook confirma depois);
// 'failed' = provedor recusou — nunca marcamos REFUNDED sem confirmação.
export interface RefundResult {
  status: 'approved' | 'pending' | 'failed'
  providerRefundId: string | null
  // resposta sanitizada do provedor (status, id, datas — nada sensível)
  response: Record<string, unknown>
  error?: string
}

export interface PaymentProvider {
  readonly name: string
  createCheckout(order: Order, user: User, method: 'PIX' | 'CARD' | 'BOLETO'): Promise<CheckoutStart>
  // valida assinatura e normaliza o evento; null = assinatura inválida
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent | null>
  // reembolso REAL na API do provedor, com chave de idempotência
  createRefund(payment: Payment, amountCents: number, idempotencyKey: string): Promise<RefundResult>
}
