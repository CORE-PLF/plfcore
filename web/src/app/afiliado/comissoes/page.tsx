import { StatusTag } from '@/components/ui'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { comissaoStatus, dataSp, periodoWhere, requireApprovedAffiliate } from '../shared'

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const { affiliate } = await requireApprovedAffiliate()
  const { de, ate } = await searchParams
  const createdAt = periodoWhere(de, ate)

  // ponytail: sem paginação — 200 últimas na tela; o CSV exporta tudo
  const comissoes = await db.commission.findMany({
    where: { affiliateId: affiliate.id, ...(createdAt ? { createdAt } : {}) },
    include: { order: { select: { id: true, status: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const qs = new URLSearchParams()
  if (de) qs.set('de', de)
  if (ate) qs.set('ate', ate)
  const csvHref = `/afiliado/comissoes/csv${qs.size ? `?${qs}` : ''}`

  return (
    <div>
      <h1 className="type-display text-4xl">COMISSÕES</h1>

      <form className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="de" className="type-kicker mb-1.5 block">
            DE
          </label>
          <input id="de" name="de" type="date" defaultValue={de} className="field type-mono" />
        </div>
        <div>
          <label htmlFor="ate" className="type-kicker mb-1.5 block">
            ATÉ
          </label>
          <input id="ate" name="ate" type="date" defaultValue={ate} className="field type-mono" />
        </div>
        <button type="submit" className="btn btn--ghost btn--sm chamfer">
          FILTRAR
        </button>
        <a href={csvHref} className="btn btn--ghost btn--sm chamfer">
          EXPORTAR CSV
        </a>
      </form>

      {comissoes.length === 0 ? (
        <p className="mt-8 text-[13px] text-ink-3">
          Nenhuma comissão no período. Comissões aparecem aqui quando uma venda atribuída ao seu
          link é paga.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                <th className="type-kicker py-2 pr-4 font-normal">PEDIDO</th>
                <th className="type-kicker py-2 pr-4 font-normal">DATA</th>
                <th className="type-kicker py-2 pr-4 font-normal">VALOR</th>
                <th className="type-kicker py-2 font-normal">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map((c) => {
                const s = comissaoStatus(c.status, c.order.status, c.approvesAt)
                return (
                  <tr key={c.id} className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                    <td className="type-mono py-2.5 pr-4 text-ink-2">
                      #{c.orderId.slice(-8).toUpperCase()}
                    </td>
                    <td className="type-mono py-2.5 pr-4 text-ink-3">{dataSp(c.createdAt)}</td>
                    <td className="type-mono py-2.5 pr-4 text-ink-1">
                      {formatCents(c.amountCents)}
                    </td>
                    <td className="py-2.5">
                      <StatusTag tone={s.tone}>{s.label}</StatusTag>
                      {s.detail && <span className="ml-2 text-[12px] text-ink-4">{s.detail}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
