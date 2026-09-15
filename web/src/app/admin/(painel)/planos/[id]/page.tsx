import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { upsertPlanAction } from '@/lib/actions/admin'
import { Chamfer } from '@/components/ui'
import { Flash, centsToInput, type SP } from '../../../_ui'

// id = 'novo' cria; qualquer outro id edita.
export default async function AdminPlanFormPage({
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

  const plan = isNew
    ? null
    : await db.plan.findUnique({ where: { id }, include: { prices: { where: { currency: 'BRL' } } } })
  if (!isNew && !plan) notFound()
  const products = isNew ? await db.product.findMany({ orderBy: { createdAt: 'asc' } }) : []

  const features = plan?.features
  const featureLines = Array.isArray(features) ? (features as string[]).join('\n') : ''
  const creditCents =
    features && !Array.isArray(features) && typeof features === 'object'
      ? ((features as { creditCents?: number }).creditCents ?? null)
      : null

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/planos" className="underline">PLANOS</Link> / {isNew ? 'NOVO' : 'EDITAR'}
        </p>
        <h1 className="type-display mt-1 text-3xl">{isNew ? 'NOVO PLANO' : plan?.name}</h1>
      </header>
      <Flash sp={sp} />

      <Chamfer cut={8} className="max-w-2xl p-5">
        <form action={upsertPlanAction} className="grid gap-4 sm:grid-cols-2">
          {isNew ? null : <input type="hidden" name="id" value={plan?.id} />}

          {isNew ? (
            <>
              <div>
                <label htmlFor="productId" className="type-kicker mb-1.5 block">PRODUTO</label>
                <select id="productId" name="productId" required className="field">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="slug" className="type-kicker mb-1.5 block">SLUG</label>
                <input id="slug" name="slug" required placeholder="anual" className="field" />
              </div>
            </>
          ) : null}

          <div>
            <label htmlFor="name" className="type-kicker mb-1.5 block">NOME</label>
            <input id="name" name="name" required defaultValue={plan?.name} className="field" />
          </div>
          <div>
            <label htmlFor="durationDays" className="type-kicker mb-1.5 block">DURAÇÃO (DIAS — VAZIO = VITALÍCIO)</label>
            <input
              id="durationDays"
              name="durationDays"
              type="number"
              min={1}
              defaultValue={plan?.durationDays ?? ''}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="deviceLimit" className="type-kicker mb-1.5 block">LIMITE DE DISPOSITIVOS</label>
            <input
              id="deviceLimit"
              name="deviceLimit"
              type="number"
              min={1}
              max={50}
              required
              defaultValue={plan?.deviceLimit ?? 1}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="sortOrder" className="type-kicker mb-1.5 block">ORDEM DE EXIBIÇÃO</label>
            <input id="sortOrder" name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} className="field" />
          </div>
          <div>
            <label htmlFor="price" className="type-kicker mb-1.5 block">PREÇO (R$)</label>
            <input
              id="price"
              name="price"
              required
              inputMode="decimal"
              placeholder="199,90"
              defaultValue={centsToInput(plan?.prices[0]?.amountCents)}
              className="field type-mono"
            />
          </div>
          <div>
            <label htmlFor="compareAt" className="type-kicker mb-1.5 block">PREÇO "DE" (R$ — OPCIONAL)</label>
            <input
              id="compareAt"
              name="compareAt"
              inputMode="decimal"
              placeholder="299,90"
              defaultValue={centsToInput(plan?.prices[0]?.compareAtCents)}
              className="field type-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="features" className="type-kicker mb-1.5 block">BENEFÍCIOS (UM POR LINHA)</label>
            <textarea id="features" name="features" rows={5} defaultValue={featureLines} className="field" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="creditCents" className="type-kicker mb-1.5 block">
              VALOR EM CRÉDITOS (R$ — SÓ PARA PACK DE CRÉDITOS; PREENCHIDO, SUBSTITUI OS BENEFÍCIOS)
            </label>
            <input
              id="creditCents"
              name="creditCents"
              inputMode="decimal"
              placeholder="500,00"
              defaultValue={centsToInput(creditCents)}
              className="field type-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="featured" defaultChecked={plan?.featured ?? false} /> DESTAQUE
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} /> ATIVO
          </label>
          <button type="submit" className="btn btn--primary chamfer sm:col-span-2">
            {isNew ? 'CRIAR PLANO' : 'SALVAR PLANO'}
          </button>
        </form>
      </Chamfer>
    </>
  )
}
