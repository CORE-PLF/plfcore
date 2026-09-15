import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { resellerCostCents } from '@/lib/resellers'
import { Kicker } from '@/components/ui'
import { requireApprovedReseller } from '../guards'
import { EmitirForm } from './emitir-form'

export const metadata: Metadata = { title: 'Emitir licença' }

export default async function EmitirPage() {
  const { reseller } = await requireApprovedReseller()

  const plans = await db.plan.findMany({
    where: { active: true, product: { slug: 'plfcore' }, prices: { some: { active: true, currency: 'BRL' } } },
    include: { prices: { where: { active: true, currency: 'BRL' } } },
    orderBy: { sortOrder: 'asc' },
  })

  const options = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    durationDays: plan.durationDays,
    listCents: plan.prices[0]?.amountCents ?? 0,
    costCents: resellerCostCents(plan, reseller.discountBps),
  }))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <Kicker>EMISSÃO</Kicker>
        <h1 className="type-display mt-1 text-4xl">EMITIR LICENÇA</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-3)' }}>
          O custo é debitado do seu saldo na hora. Saldo disponível:{' '}
          <span className="type-mono" style={{ color: 'var(--color-ink-1)' }}>
            {formatCents(reseller.creditBalanceCents)}
          </span>
        </p>
      </div>

      <EmitirForm plans={options} balanceCents={reseller.creditBalanceCents} />
    </div>
  )
}
