import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { upsertCouponAction } from '@/lib/actions/admin'
import { Chamfer } from '@/components/ui'
import { Flash, centsToInput, type SP } from '../../../_ui'

// ponytail: janela em horário do servidor (UTC em produção) — exibida e gravada sem conversão
function toDatetimeInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 16) : ''
}

export default async function AdminCouponFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  await requireStaff('ADMIN')
  const { id } = await params
  const sp = await searchParams
  const isNew = id === 'novo'

  const coupon = isNew ? null : await db.coupon.findUnique({ where: { id } })
  if (!isNew && !coupon) notFound()
  const plans = await db.plan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
  const selectedPlanIds = coupon && Array.isArray(coupon.planIds) ? (coupon.planIds as string[]) : []

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/cupons" className="underline">CUPONS</Link> / {isNew ? 'NOVO' : 'EDITAR'}
        </p>
        <h1 className="type-display mt-1 text-3xl">{isNew ? 'NOVO CUPOM' : coupon?.code}</h1>
      </header>
      <Flash sp={sp} />

      <Chamfer cut={8} className="max-w-2xl p-5">
        <form action={upsertCouponAction} className="grid gap-4 sm:grid-cols-2">
          {isNew ? null : <input type="hidden" name="id" value={coupon?.id} />}

          <div>
            <label htmlFor="code" className="type-kicker mb-1.5 block">CÓDIGO</label>
            <input
              id="code"
              name="code"
              required
              minLength={3}
              defaultValue={coupon?.code}
              placeholder="BEMVINDO10"
              className="field type-mono uppercase"
            />
          </div>
          <div>
            <label htmlFor="type" className="type-kicker mb-1.5 block">TIPO</label>
            <select id="type" name="type" defaultValue={coupon?.type ?? 'PERCENT'} className="field">
              <option value="PERCENT">PERCENTUAL (%)</option>
              <option value="FIXED">VALOR FIXO (R$)</option>
            </select>
          </div>
          <div>
            <label htmlFor="value" className="type-kicker mb-1.5 block">VALOR (% OU R$ CONFORME O TIPO)</label>
            <input
              id="value"
              name="value"
              required
              inputMode="decimal"
              placeholder="10"
              defaultValue={
                coupon ? (coupon.type === 'PERCENT' ? String(coupon.value / 100) : centsToInput(coupon.value)) : ''
              }
              className="field type-mono"
            />
          </div>
          <div>
            <label htmlFor="minAmount" className="type-kicker mb-1.5 block">PEDIDO MÍNIMO (R$ — OPCIONAL)</label>
            <input
              id="minAmount"
              name="minAmount"
              inputMode="decimal"
              defaultValue={centsToInput(coupon?.minAmountCents)}
              className="field type-mono"
            />
          </div>
          <div>
            <label htmlFor="maxRedemptions" className="type-kicker mb-1.5 block">LIMITE TOTAL DE USOS (VAZIO = SEM LIMITE)</label>
            <input
              id="maxRedemptions"
              name="maxRedemptions"
              type="number"
              min={1}
              defaultValue={coupon?.maxRedemptions ?? ''}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="perUserLimit" className="type-kicker mb-1.5 block">LIMITE POR USUÁRIO</label>
            <input
              id="perUserLimit"
              name="perUserLimit"
              type="number"
              min={1}
              required
              defaultValue={coupon?.perUserLimit ?? 1}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="startsAt" className="type-kicker mb-1.5 block">INÍCIO (OPCIONAL)</label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={toDatetimeInput(coupon?.startsAt)}
              className="field type-mono"
            />
          </div>
          <div>
            <label htmlFor="endsAt" className="type-kicker mb-1.5 block">FIM (OPCIONAL)</label>
            <input
              id="endsAt"
              name="endsAt"
              type="datetime-local"
              defaultValue={toDatetimeInput(coupon?.endsAt)}
              className="field type-mono"
            />
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="type-kicker mb-1.5">PLANOS APLICÁVEIS (NENHUM MARCADO = TODOS)</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {plans.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" name="planIds" value={p.id} defaultChecked={selectedPlanIds.includes(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="active" defaultChecked={coupon?.active ?? true} /> ATIVO
          </label>
          <button type="submit" className="btn btn--primary chamfer sm:col-span-2">
            {isNew ? 'CRIAR CUPOM' : 'SALVAR CUPOM'}
          </button>
        </form>
      </Chamfer>
    </>
  )
}
