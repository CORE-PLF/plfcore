import { describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { addCredits, issueResellerLicense, resellerCostCents } from '@/lib/resellers'
import { createUser, mensalPlan } from './helpers'

async function makeReseller(discountBps = 2000) {
  const user = await createUser('revenda')
  return db.reseller.create({ data: { userId: user.id, status: 'APPROVED', discountBps } })
}

describe('addCredits', () => {
  test('registra ledger com balanceAfter e atualiza o cache do saldo', async () => {
    const reseller = await makeReseller()
    await addCredits(reseller.id, 12345, { type: 'ADMIN_ADJUST', note: 'teste' })

    const fresh = await db.reseller.findUniqueOrThrow({ where: { id: reseller.id } })
    expect(fresh.creditBalanceCents).toBe(12345)

    const ledger = await db.resellerLedger.findMany({ where: { resellerId: reseller.id } })
    expect(ledger).toHaveLength(1)
    expect(ledger[0].type).toBe('ADMIN_ADJUST')
    expect(ledger[0].deltaCents).toBe(12345)
    expect(ledger[0].balanceAfter).toBe(12345)
  })

  test('valor não positivo é rejeitado', async () => {
    const reseller = await makeReseller()
    await expect(addCredits(reseller.id, 0, {})).rejects.toThrow(/positivo/i)
  })
})

describe('issueResellerLicense', () => {
  test('debita o custo e emite licença vinculada ao revendedor', async () => {
    const plan = await mensalPlan()
    const reseller = await makeReseller()
    const cost = resellerCostCents(plan, reseller.discountBps)
    await addCredits(reseller.id, cost + 100, { type: 'ADMIN_ADJUST' })

    const result = await issueResellerLicense(reseller.id, plan.id, { customerLabel: 'Cliente X' })
    expect(result.costCents).toBe(cost)
    expect(result.balanceAfter).toBe(100)
    expect(result.plainKey).not.toBeNull()
    expect(result.license.resellerId).toBe(reseller.id)
    expect(result.license.status).toBe('PENDING_ACTIVATION')

    const fresh = await db.reseller.findUniqueOrThrow({ where: { id: reseller.id } })
    expect(fresh.creditBalanceCents).toBe(100)

    const row = await db.resellerLedger.findFirst({
      where: { resellerId: reseller.id, type: 'LICENSE_ISSUE' },
    })
    expect(row).not.toBeNull()
    expect(row!.deltaCents).toBe(-cost)
    expect(row!.balanceAfter).toBe(100)
    expect(row!.refLicenseId).toBe(result.license.id)
  })

  test('saldo insuficiente lança erro e não emite', async () => {
    const plan = await mensalPlan()
    const reseller = await makeReseller()
    const cost = resellerCostCents(plan, reseller.discountBps)
    await addCredits(reseller.id, cost - 1, { type: 'ADMIN_ADJUST' })

    await expect(issueResellerLicense(reseller.id, plan.id, {})).rejects.toThrow(/insuficiente/i)

    expect(await db.license.count({ where: { resellerId: reseller.id } })).toBe(0)
    const fresh = await db.reseller.findUniqueOrThrow({ where: { id: reseller.id } })
    expect(fresh.creditBalanceCents).toBe(cost - 1)
  })

  test('concorrência: saldo pra exatamente 1 emissão → 1 sucesso, 1 falha, saldo >= 0', async () => {
    const plan = await mensalPlan()
    const reseller = await makeReseller()
    const cost = resellerCostCents(plan, reseller.discountBps)
    await addCredits(reseller.id, cost, { type: 'ADMIN_ADJUST' })

    const results = await Promise.allSettled([
      issueResellerLicense(reseller.id, plan.id, {}),
      issueResellerLicense(reseller.id, plan.id, {}),
    ])
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const fresh = await db.reseller.findUniqueOrThrow({ where: { id: reseller.id } })
    expect(fresh.creditBalanceCents).toBeGreaterThanOrEqual(0)
    expect(fresh.creditBalanceCents).toBe(0)

    expect(await db.license.count({ where: { resellerId: reseller.id } })).toBe(1)

    // ledger consistente: soma dos deltas bate com o saldo em cache
    const ledger = await db.resellerLedger.findMany({ where: { resellerId: reseller.id } })
    expect(ledger.filter((r) => r.type === 'LICENSE_ISSUE')).toHaveLength(1)
    const sum = ledger.reduce((acc, r) => acc + r.deltaCents, 0)
    expect(sum).toBe(fresh.creditBalanceCents)
  })
})
