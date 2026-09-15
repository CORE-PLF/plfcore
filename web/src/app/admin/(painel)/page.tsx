import Link from 'next/link'
import { hasStaffRole, requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { reprocessPaymentEventAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { Flash, PageTitle, Table, Td, fmtDate, spStr, toneFor, type SP } from '../_ui'

// Visão geral: tudo medido direto do banco — nenhum número inventado.
export default async function AdminHomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff('SUPPORT')
  const sp = await searchParams
  const days = spStr(sp, 'periodo') === '30' ? 30 : 7
  const since = new Date(Date.now() - days * 86400_000)
  const since7 = new Date(Date.now() - 7 * 86400_000)
  const paidWhere = { status: 'PAID' as const, paidAt: { gte: since } }

  const [
    revenue,
    activeLicenses,
    expiredLicenses,
    topPlans,
    refunds,
    chargebacks,
    badEvents,
    failedJobs,
    deadJobs,
    discordFails,
    rejectedInstalls7d,
    invalidKeys7d,
  ] = await Promise.all([
    db.order.aggregate({ where: paidWhere, _sum: { totalCents: true }, _count: { _all: true } }),
    db.license.count({ where: { status: 'ACTIVE' } }),
    db.license.count({ where: { status: 'EXPIRED' } }),
    db.order.groupBy({
      by: ['planId'],
      where: paidWhere,
      _count: { _all: true },
      orderBy: { _count: { planId: 'desc' } },
      take: 5,
    }),
    db.order.count({ where: { status: 'REFUNDED', updatedAt: { gte: since } } }),
    db.order.count({ where: { status: 'CHARGEBACK', updatedAt: { gte: since } } }),
    db.paymentEvent.findMany({
      where: { OR: [{ signatureValid: false }, { error: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    db.job.count({ where: { status: 'FAILED' } }),
    db.job.count({ where: { status: 'DEAD' } }),
    db.discordDelivery.count({ where: { status: 'FAILED' } }),
    db.licenseEvent.count({ where: { type: 'ACTIVATION_REJECTED_NEW_INSTALL', createdAt: { gte: since7 } } }),
    db.auditLog.count({ where: { action: 'api.activate_invalid_key', createdAt: { gte: since7 } } }),
  ])

  const planNames = new Map(
    (await db.plan.findMany({ where: { id: { in: topPlans.map((t) => t.planId) } }, select: { id: true, name: true } })).map(
      (p) => [p.id, p.name],
    ),
  )

  const totalCents = revenue._sum.totalCents ?? 0
  const sales = revenue._count._all
  const isAdmin = hasStaffRole(staff, 'ADMIN')

  const metrics = [
    { label: `RECEITA (${days}D)`, value: formatCents(totalCents) },
    { label: `VENDAS (${days}D)`, value: String(sales) },
    { label: 'TICKET MÉDIO', value: sales > 0 ? formatCents(Math.round(totalCents / sales)) : '—' },
    { label: 'LICENÇAS ATIVAS', value: String(activeLicenses) },
    { label: 'LICENÇAS EXPIRADAS', value: String(expiredLicenses) },
    { label: `REEMBOLSOS (${days}D)`, value: String(refunds) },
    { label: `CHARGEBACKS (${days}D)`, value: String(chargebacks) },
  ]

  return (
    <>
      <PageTitle kicker="VISÃO GERAL" title="OPERAÇÃO">
        <nav className="flex gap-2" aria-label="Período">
          <Link href="/admin?periodo=7" className={`btn btn--sm chamfer ${days === 7 ? 'btn--primary' : 'btn--ghost'}`}>
            7 DIAS
          </Link>
          <Link href="/admin?periodo=30" className={`btn btn--sm chamfer ${days === 30 ? 'btn--primary' : 'btn--ghost'}`}>
            30 DIAS
          </Link>
        </nav>
      </PageTitle>
      <Flash sp={sp} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <Chamfer key={m.label} cut={6} className="p-4">
            <p className="type-kicker">{m.label}</p>
            <p className="type-mono mt-2 text-2xl text-ink-1">{m.value}</p>
          </Chamfer>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="type-kicker mb-3">PLANOS MAIS VENDIDOS ({days}D)</h2>
          {topPlans.length === 0 ? (
            <p className="type-mono text-[12px] text-ink-3">Nenhuma venda no período.</p>
          ) : (
            <Table head={['PLANO', 'VENDAS']}>
              {topPlans.map((t) => (
                <tr key={t.planId}>
                  <Td>{planNames.get(t.planId) ?? t.planId}</Td>
                  <Td className="text-ink-1">{t._count._all}</Td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <div>
          <h2 className="type-kicker mb-3">SAÚDE DO SISTEMA</h2>
          <div className="grid grid-cols-3 gap-3">
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">JOBS FAILED</p>
              <p className={`type-mono mt-1 text-xl ${failedJobs > 0 ? 'text-heat' : 'text-ink-1'}`}>{failedJobs}</p>
            </Chamfer>
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">JOBS DEAD</p>
              <p className={`type-mono mt-1 text-xl ${deadJobs > 0 ? 'text-signal' : 'text-ink-1'}`}>{deadJobs}</p>
            </Chamfer>
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">DISCORD FALHAS</p>
              <p className={`type-mono mt-1 text-xl ${discordFails > 0 ? 'text-heat' : 'text-ink-1'}`}>{discordFails}</p>
            </Chamfer>
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">TENTATIVAS EM OUTRA INSTALAÇÃO (7D)</p>
              <p className={`type-mono mt-1 text-xl ${rejectedInstalls7d > 0 ? 'text-heat' : 'text-ink-1'}`}>{rejectedInstalls7d}</p>
              {rejectedInstalls7d > 20 ? (
                <Link href="/admin/licencas?estado=CONSUMIDA" className="mt-2 inline-block">
                  <StatusTag tone="warn">ACIMA DE 20 — VER LICENÇAS</StatusTag>
                </Link>
              ) : null}
            </Chamfer>
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">CHAVES INVÁLIDAS (7D)</p>
              <p className={`type-mono mt-1 text-xl ${invalidKeys7d > 0 ? 'text-heat' : 'text-ink-1'}`}>{invalidKeys7d}</p>
              {invalidKeys7d > 20 ? (
                <Link href="/admin/licencas" className="mt-2 inline-block">
                  <StatusTag tone="warn">ACIMA DE 20 — VER LICENÇAS</StatusTag>
                </Link>
              ) : null}
            </Chamfer>
          </div>

          <h3 className="type-kicker mt-4 mb-2">EVENTOS DE PAGAMENTO COM PROBLEMA</h3>
          {badEvents.length === 0 ? (
            <p className="type-mono text-[12px] text-ink-1">[OK] Nenhum evento com assinatura inválida ou erro.</p>
          ) : (
            <Table head={['QUANDO', 'PROVEDOR', 'TIPO', 'PROBLEMA', '']}>
              {badEvents.map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDate(e.createdAt)}</Td>
                  <Td>{e.provider}</Td>
                  <Td>{e.type}</Td>
                  <Td className="max-w-[280px] truncate whitespace-normal">
                    {!e.signatureValid ? (
                      <StatusTag tone="danger">ASSINATURA INVÁLIDA</StatusTag>
                    ) : (
                      <span className="text-signal">{e.error}</span>
                    )}
                  </Td>
                  <Td>
                    {isAdmin && e.error ? (
                      <form action={reprocessPaymentEventAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="back" value={`/admin?periodo=${days}`} />
                        <button type="submit" className="btn btn--ghost btn--sm chamfer">
                          REPROCESSAR
                        </button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </section>
    </>
  )
}
