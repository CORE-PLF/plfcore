import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  TicketPriority,
  TicketStatus,
} from '@/generated/prisma/client'
import type { LicenseDisplayState } from '@/lib/licensing'

export type Tone = 'ok' | 'danger' | 'warn' | 'muted'

const TZ = 'America/Sao_Paulo'

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: TZ })
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}

export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// Estado DERIVADO da licença (licenseDisplayState) — nunca o status bruto do banco.
export const DISPLAY_TAG: Record<LicenseDisplayState, { label: string; tone: Tone }> = {
  SEM_ATIVACAO: { label: 'SEM ATIVAÇÃO', tone: 'muted' },
  ATIVA: { label: 'ATIVA', tone: 'ok' },
  CONSUMIDA_OUTRA_INSTALACAO: { label: 'CONSUMIDA EM OUTRA INSTALAÇÃO', tone: 'warn' },
  EXPIRADA: { label: 'EXPIRADA', tone: 'danger' },
  SUSPENSA: { label: 'SUSPENSA', tone: 'danger' },
  REVOGADA: { label: 'REVOGADA', tone: 'danger' },
  BLOQUEADA: { label: 'BLOQUEADA', tone: 'danger' },
  SUBSTITUIDA: { label: 'SUBSTITUÍDA', tone: 'muted' },
}

export const REJECTED_EVENT = 'ACTIVATION_REJECTED_NEW_INSTALL'

export const ORDER_TAG: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'PENDENTE', tone: 'warn' },
  AWAITING_PAYMENT: { label: 'AGUARDANDO PAGAMENTO', tone: 'warn' },
  PAID: { label: 'PAGO', tone: 'ok' },
  CANCELLED: { label: 'CANCELADO', tone: 'muted' },
  EXPIRED: { label: 'EXPIRADO', tone: 'muted' },
  IN_REVIEW: { label: 'EM ANÁLISE', tone: 'warn' },
  REFUND_PENDING: { label: 'REEMBOLSO EM PROCESSAMENTO', tone: 'warn' },
  REFUND_FAILED: { label: 'REEMBOLSO COM FALHA', tone: 'danger' },
  REFUNDED: { label: 'REEMBOLSADO', tone: 'muted' },
  PARTIALLY_REFUNDED: { label: 'REEMBOLSO PARCIAL', tone: 'muted' },
  CHARGEBACK: { label: 'CHARGEBACK', tone: 'danger' },
}

export const PAYMENT_TAG: Record<PaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'PENDENTE', tone: 'warn' },
  APPROVED: { label: 'APROVADO', tone: 'ok' },
  DECLINED: { label: 'RECUSADO', tone: 'danger' },
  REFUNDED: { label: 'REEMBOLSADO', tone: 'muted' },
  CHARGEBACK: { label: 'CHARGEBACK', tone: 'danger' },
  CANCELLED: { label: 'CANCELADO', tone: 'muted' },
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  CARD: 'CARTÃO',
  BOLETO: 'BOLETO',
  SANDBOX: 'SANDBOX',
  RESELLER_CREDIT: 'CRÉDITO DE REVENDA',
}

export const TICKET_TAG: Record<TicketStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'ABERTO', tone: 'warn' },
  AWAITING_SUPPORT: { label: 'AGUARDANDO SUPORTE', tone: 'warn' },
  AWAITING_CUSTOMER: { label: 'AGUARDANDO VOCÊ', tone: 'warn' },
  RESOLVED: { label: 'RESOLVIDO', tone: 'ok' },
  CLOSED: { label: 'FECHADO', tone: 'muted' },
}

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: 'BAIXA',
  NORMAL: 'NORMAL',
  HIGH: 'ALTA',
  URGENT: 'URGENTE',
}

export const TICKET_CATEGORIES = [
  { value: 'duvida', label: 'DÚVIDA' },
  { value: 'tecnico', label: 'PROBLEMA TÉCNICO' },
  { value: 'pagamento', label: 'PAGAMENTO' },
  { value: 'licenca', label: 'LICENÇA' },
  { value: 'privacidade', label: 'PRIVACIDADE' },
  { value: 'outro', label: 'OUTRO' },
] as const

export function categoryLabel(value: string): string {
  return TICKET_CATEGORIES.find((c) => c.value === value)?.label ?? value.toUpperCase()
}

export function firstParam(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>
