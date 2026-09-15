import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { Chamfer, Kicker, RuleFade, StatusTag } from '@/components/ui'
import { requireApprovedReseller } from '../guards'

export const metadata: Metadata = { title: 'Relatórios de revenda' }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const { reseller } = await requireApprovedReseller()
  const params = await searchParams

  const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const de = params.de && DATE_RE.test(params.de) ? params.de : `${hojeSP.slice(0, 8)}01`
  const ate = params.ate && DATE_RE.test(params.ate) ? params.ate : hojeSP

  // dias interpretados no fuso de São Paulo (UTC-3, sem horário de verão)
  const gte = new Date(`${de}T00:00:00-03:00`)
  const lt = new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 86400_000)

  const entries = await db.resellerLedger.findMany({
    where: { resellerId: reseller.id, createdAt: { gte, lt } },
    orderBy: { createdAt: 'asc' },
  })

  const issues = entries.filter((e) => e.type === 'LICENSE_ISSUE')
  const creditosGastos = entries.reduce((sum, e) => sum + (e.deltaCents < 0 ? -e.deltaCents : 0), 0)
  const custoTotal = issues.reduce((sum, e) => sum - e.deltaCents, 0)

  const licenseIds = issues.map((e) => e.refLicenseId).filter((id): id is string => id !== null)
  const licenses = await db.license.findMany({
    where: { id: { in: licenseIds } },
    include: { plan: { include: { prices: { where: { active: true, currency: 'BRL' } } } } },
  })
  const byId = new Map(licenses.map((l) => [l.id, l]))

  const porPlano = new Map<string, { name: string; count: number; custo: number; margem: number }>()
  let margemTotal = 0
  for (const issue of issues) {
    const lic = issue.refLicenseId ? byId.get(issue.refLicenseId) : undefined
    if (!lic) continue
    const custo = -issue.deltaCents
    const tabela = lic.plan.prices[0]?.amountCents ?? 0
    const margem = tabela - custo
    margemTotal += margem
    const row = porPlano.get(lic.planId) ?? { name: lic.plan.name, count: 0, custo: 0, margem: 0 }
    row.count += 1
    row.custo += custo
    row.margem += margem
    porPlano.set(lic.planId, row)
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Kicker>RELATÓRIOS</Kicker>
        <h1 className="type-display mt-1 text-4xl">DESEMPENHO DA REVENDA</h1>
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="de" className="type-kicker mb-1.5 block">
            DE
          </label>
          <input id="de" name="de" type="date" defaultValue={de} required className="field" />
        </div>
        <div>
          <label htmlFor="ate" className="type-kicker mb-1.5 block">
            ATÉ
          </label>
          <input id="ate" name="ate" type="date" defaultValue={ate} required className="field" />
        </div>
        <button type="submit" className="btn btn--ghost chamfer">
          APLICAR
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Chamfer cut={8} className="p-5">
          <Kicker>CRÉDITOS GASTOS</Kicker>
          <p className="type-mono mt-2 text-2xl" style={{ color: 'var(--color-ink-1)' }}>
            {formatCents(creditosGastos)}
          </p>
        </Chamfer>
        <Chamfer cut={8} className="p-5">
          <Kicker>LICENÇAS EMITIDAS</Kicker>
          <p className="type-mono mt-2 text-2xl" style={{ color: 'var(--color-ink-1)' }}>
            {issues.length}
          </p>
        </Chamfer>
        <Chamfer cut={8} className="p-5">
          <Kicker>CUSTO TOTAL</Kicker>
          <p className="type-mono mt-2 text-2xl" style={{ color: 'var(--color-ink-1)' }}>
            {formatCents(custoTotal)}
          </p>
        </Chamfer>
        <Chamfer cut={8} className="p-5">
          <div className="flex items-center justify-between gap-2">
            <Kicker>MARGEM</Kicker>
            <StatusTag tone="warn">ESTIMADO</StatusTag>
          </div>
          <p className="type-mono mt-2 text-2xl" style={{ color: 'var(--color-ink-1)' }}>
            {formatCents(margemTotal)}
          </p>
        </Chamfer>
      </div>

      <p className="max-w-3xl text-sm" style={{ color: 'var(--color-ink-3)' }}>
        Margem estimada = preço de tabela − custo em créditos, somado por licença emitida no
        período. É estimativa: o preço final ao cliente é definido por você.
      </p>

      <section>
        <h2 className="type-display text-2xl">POR PLANO</h2>
        <RuleFade className="my-4" />
        {porPlano.size === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-ink-3)' }}>
            Nenhuma licença emitida no período selecionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                  <th className="type-kicker py-2 pr-4 font-bold">PLANO</th>
                  <th className="type-kicker py-2 pr-4 text-right font-bold">EMITIDAS</th>
                  <th className="type-kicker py-2 pr-4 text-right font-bold">CUSTO</th>
                  <th className="type-kicker py-2 text-right font-bold">MARGEM EST.</th>
                </tr>
              </thead>
              <tbody>
                {[...porPlano.values()].map((row) => (
                  <tr key={row.name} className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                    <td className="py-2.5 pr-4" style={{ color: 'var(--color-ink-2)' }}>
                      {row.name}
                    </td>
                    <td className="type-mono py-2.5 pr-4 text-right" style={{ color: 'var(--color-ink-1)' }}>
                      {row.count}
                    </td>
                    <td className="type-mono py-2.5 pr-4 text-right" style={{ color: 'var(--color-ink-1)' }}>
                      {formatCents(row.custo)}
                    </td>
                    <td className="type-mono py-2.5 text-right" style={{ color: 'var(--color-ink-1)' }}>
                      {formatCents(row.margem)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
