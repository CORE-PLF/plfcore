import type { Plan, Prisma } from '@/generated/prisma/client'
import { db } from './db'
import { audit } from './audit'
import { issueOrExtendLicense } from './licensing'
import { applyPercentBps } from './money'

// Ledger é a fonte da verdade; o saldo em Reseller é cache atualizado na MESMA
// transação. Débito usa updateMany condicional (saldo >= custo) — é o que
// impede saldo negativo sob concorrência, sem lock manual.

export function resellerCostCents(plan: Plan & { prices: { amountCents: number }[] }, discountBps: number): number {
  const list = plan.prices[0]?.amountCents ?? 0
  return Math.max(0, list - applyPercentBps(list, discountBps))
}

export async function addCredits(
  resellerId: string,
  amountCents: number,
  opts: { type?: 'CREDIT_PURCHASE' | 'ADMIN_ADJUST'; refOrderId?: string; note?: string; actorUserId?: string },
  outerTx?: Prisma.TransactionClient,
) {
  if (amountCents <= 0) throw new Error('Valor de crédito precisa ser positivo.')
  const run = async (tx: Prisma.TransactionClient) => {
    const reseller = await tx.reseller.update({
      where: { id: resellerId },
      data: { creditBalanceCents: { increment: amountCents } },
    })
    await tx.resellerLedger.create({
      data: {
        resellerId,
        type: opts.type ?? 'CREDIT_PURCHASE',
        deltaCents: amountCents,
        balanceAfter: reseller.creditBalanceCents,
        refOrderId: opts.refOrderId ?? null,
        note: opts.note ?? null,
      },
    })
    await audit(
      { actorUserId: opts.actorUserId, action: 'reseller.credit_add', entity: 'reseller', entityId: resellerId, after: { amountCents } },
      tx,
    )
    return reseller
  }
  return outerTx ? run(outerTx) : db.$transaction(run)
}

export async function issueResellerLicense(
  resellerId: string,
  planId: string,
  opts: { customerLabel?: string; actorUserId?: string },
) {
  return db.$transaction(async (tx) => {
    const reseller = await tx.reseller.findUniqueOrThrow({ where: { id: resellerId } })
    if (reseller.status !== 'APPROVED') throw new Error('Conta de revendedor não aprovada.')

    const plan = await tx.plan.findUniqueOrThrow({
      where: { id: planId },
      include: { prices: { where: { active: true, currency: 'BRL' } } },
    })
    const cost = resellerCostCents(plan, reseller.discountBps)

    // limites diários/mensais
    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1))
    const [today, thisMonth] = await Promise.all([
      tx.license.count({ where: { resellerId, createdAt: { gte: dayStart } } }),
      tx.license.count({ where: { resellerId, createdAt: { gte: monthStart } } }),
    ])
    if (today >= reseller.dailyIssueLimit) throw new Error('Limite diário de emissão atingido.')
    if (thisMonth >= reseller.monthlyIssueLimit) throw new Error('Limite mensal de emissão atingido.')

    // débito atômico condicionado ao saldo — zero chance de saldo negativo
    const debited = await tx.reseller.updateMany({
      where: { id: resellerId, creditBalanceCents: { gte: cost } },
      data: { creditBalanceCents: { decrement: cost } },
    })
    if (debited.count === 0) throw new Error('Saldo de créditos insuficiente.')
    const after = await tx.reseller.findUniqueOrThrow({ where: { id: resellerId } })

    const issued = await issueOrExtendLicense(tx, {
      userId: reseller.userId,
      plan,
      resellerId,
      actorUserId: opts.actorUserId,
    })

    await tx.resellerLedger.create({
      data: {
        resellerId,
        type: 'LICENSE_ISSUE',
        deltaCents: -cost,
        balanceAfter: after.creditBalanceCents,
        refLicenseId: issued.license.id,
        note: opts.customerLabel ? `Cliente: ${opts.customerLabel}` : null,
      },
    })
    if (opts.customerLabel) {
      await tx.license.update({ where: { id: issued.license.id }, data: { adminNotes: `Revenda — ${opts.customerLabel}` } })
    }
    await audit(
      {
        actorUserId: opts.actorUserId,
        action: 'reseller.license_issue',
        entity: 'license',
        entityId: issued.license.id,
        after: { resellerId, planId, costCents: cost },
      },
      tx,
    )
    return { ...issued, costCents: cost, balanceAfter: after.creditBalanceCents }
  })
}
