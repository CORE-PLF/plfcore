import { Chamfer, StatusTag } from '@/components/ui'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { getSettingNumber } from '@/lib/settings'
import { SaqueForm } from '../forms'
import { dataSp, pixDe, requireApprovedAffiliate, saldoDisponivelCents } from '../shared'

const SAQUE_STATUS = {
  REQUESTED: { label: 'SOLICITADO', tone: 'muted' },
  APPROVED: { label: 'APROVADO', tone: 'warn' },
  PAID: { label: 'PAGO', tone: 'ok' },
  REJECTED: { label: 'RECUSADO', tone: 'danger' },
} as const

export default async function SaquesPage() {
  const { affiliate } = await requireApprovedAffiliate()
  const [saldo, minCents, saques] = await Promise.all([
    saldoDisponivelCents(affiliate.id),
    getSettingNumber('payout_min_cents', 5000),
    db.payoutRequest.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  return (
    <div>
      <h1 className="type-display text-4xl">SAQUES</h1>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <Chamfer cut={8} className="p-5">
            <p className="type-kicker">SALDO DISPONÍVEL</p>
            <p className="type-mono mt-2 text-3xl text-ink-1">
              {formatCents(Math.max(saldo, 0))}
            </p>
            <p className="mt-2 text-[12px] text-ink-4">
              Comissões aprovadas menos saques já solicitados ou pagos.
            </p>
          </Chamfer>

          <div className="mt-6">
            <h2 className="type-display mb-4 text-xl">SOLICITAR SAQUE</h2>
            <SaqueForm pixPadrao={pixDe(affiliate)} minLabel={formatCents(minCents)} />
          </div>
        </div>

        <div>
          <h2 className="type-display mb-4 text-xl">HISTÓRICO</h2>
          {saques.length === 0 ? (
            <p className="text-[13px] text-ink-3">Nenhum saque solicitado até agora.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[13px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                    <th className="type-kicker py-2 pr-4 font-normal">DATA</th>
                    <th className="type-kicker py-2 pr-4 font-normal">VALOR</th>
                    <th className="type-kicker py-2 font-normal">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {saques.map((s) => {
                    const st = SAQUE_STATUS[s.status]
                    return (
                      <tr key={s.id} className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                        <td className="type-mono py-2.5 pr-4 text-ink-3">{dataSp(s.createdAt)}</td>
                        <td className="type-mono py-2.5 pr-4 text-ink-1">
                          {formatCents(s.amountCents)}
                        </td>
                        <td className="py-2.5">
                          <StatusTag tone={st.tone}>{st.label}</StatusTag>
                          {s.status === 'REJECTED' && s.adminNote && (
                            <span className="ml-2 text-[12px] text-ink-4">{s.adminNote}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
