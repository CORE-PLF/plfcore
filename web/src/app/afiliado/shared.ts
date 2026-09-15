import { redirect } from 'next/navigation'
import type { Affiliate, CommissionStatus, OrderStatus, Prisma, User } from '@/generated/prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

// Helpers do painel de afiliado — só server, importados por páginas, route handler e actions.

export async function requireApprovedAffiliate(): Promise<{ user: User; affiliate: Affiliate }> {
  const user = await requireUser()
  const affiliate = await db.affiliate.findUnique({ where: { userId: user.id } })
  if (!affiliate || affiliate.status !== 'APPROVED') redirect('/afiliado')
  return { user, affiliate }
}

// Saldo = comissões APPROVED − saques em aberto (REQUESTED/APPROVED).
// Saque PAGO não entra na subtração: ao marcá-lo pago, o admin converte as
// comissões correspondentes APPROVED→PAID (elas já saem da soma da esquerda).
export async function saldoDisponivelCents(
  affiliateId: string,
  tx: Prisma.TransactionClient = db,
): Promise<number> {
  const aprovadas = await tx.commission.aggregate({
    where: { affiliateId, status: 'APPROVED' },
    _sum: { amountCents: true },
  })
  const saques = await tx.payoutRequest.aggregate({
    where: { affiliateId, status: { in: ['REQUESTED', 'APPROVED'] } },
    _sum: { amountCents: true },
  })
  return (aprovadas._sum.amountCents ?? 0) - (saques._sum.amountCents ?? 0)
}

// Período em horário de São Paulo (UTC-3 fixo, sem horário de verão desde 2019).
export function periodoWhere(de?: string, ate?: string): { gte?: Date; lte?: Date } | undefined {
  const range: { gte?: Date; lte?: Date } = {}
  if (de && /^\d{4}-\d{2}-\d{2}$/.test(de)) range.gte = new Date(`${de}T00:00:00-03:00`)
  if (ate && /^\d{4}-\d{2}-\d{2}$/.test(ate)) range.lte = new Date(`${ate}T23:59:59.999-03:00`)
  return range.gte || range.lte ? range : undefined
}

export function pixDe(affiliate: Affiliate): string {
  const info = affiliate.payoutInfo
  if (info && typeof info === 'object' && !Array.isArray(info) && 'pix' in info) {
    const pix = (info as { pix?: unknown }).pix
    return typeof pix === 'string' ? pix : ''
  }
  return ''
}

export function comissaoStatus(
  status: CommissionStatus,
  orderStatus: OrderStatus,
  approvesAt: Date,
): { label: string; detail: string; tone: 'ok' | 'danger' | 'warn' | 'muted' } {
  switch (status) {
    case 'PENDING':
      return {
        label: 'PENDENTE',
        detail: `aprova em ${approvesAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        tone: 'warn',
      }
    case 'APPROVED':
      return { label: 'APROVADA', detail: '', tone: 'ok' }
    case 'PAID':
      return { label: 'PAGA', detail: '', tone: 'ok' }
    case 'CANCELLED':
      return {
        label: 'CANCELADA',
        detail:
          orderStatus === 'CHARGEBACK'
            ? 'chargeback'
            : orderStatus === 'REFUNDED' || orderStatus === 'PARTIALLY_REFUNDED'
              ? 'reembolso'
              : '',
        tone: 'danger',
      }
  }
}

export function dataSp(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
