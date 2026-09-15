import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { setAffiliateCommissionAction, setAffiliateStatusAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { DangerZone, Flash, ReasonInput, Table, Td, fmtDate, toneFor, type SP } from '../../../_ui'

export default async function AdminAffiliateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  await requireStaff('ADMIN')
  const { id } = await params
  const sp = await searchParams

  const affiliate = await db.affiliate.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      commissions: { orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { id: true } } } },
      payouts: { orderBy: { createdAt: 'desc' }, take: 20 },
      _count: { select: { clicks: true, orders: true } },
    },
  })
  if (!affiliate) notFound()

  const totals = await db.commission.groupBy({
    by: ['status'],
    where: { affiliateId: id },
    _sum: { amountCents: true },
  })
  const totalBy = (s: string) => totals.find((t) => t.status === s)?._sum.amountCents ?? 0

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/afiliados" className="underline">AFILIADOS</Link> / DETALHE
        </p>
        <h1 className="type-display mt-1 flex flex-wrap items-center gap-3 text-3xl">
          {affiliate.code} <StatusTag tone={toneFor(affiliate.status)}>{affiliate.status}</StatusTag>
        </h1>
      </header>
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['CLIQUES', String(affiliate._count.clicks)],
              ['PEDIDOS', String(affiliate._count.orders)],
              ['A LIBERAR', formatCents(totalBy('PENDING'))],
              ['LIBERADO', formatCents(totalBy('APPROVED'))],
            ].map(([k, v]) => (
              <Chamfer key={k} cut={6} className="p-3">
                <p className="type-kicker">{k}</p>
                <p className="type-mono mt-1 text-lg text-ink-1">{v}</p>
              </Chamfer>
            ))}
          </div>

          <Chamfer cut={8} className="p-4">
            <dl className="type-mono grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="type-kicker">USUÁRIO</dt>
                <dd className="mt-0.5">
                  <Link href={`/admin/usuarios/${affiliate.user.id}`} className="text-ink-1 underline">
                    {affiliate.user.email}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="type-kicker">COMISSÃO</dt>
                <dd className="mt-0.5">{(affiliate.commissionBps / 100).toFixed(2).replace('.', ',')}%</dd>
              </div>
              <div>
                <dt className="type-kicker">JANELA DE ATRIBUIÇÃO</dt>
                <dd className="mt-0.5">{affiliate.windowDays} DIAS</dd>
              </div>
              <div>
                <dt className="type-kicker">TOTAL PAGO</dt>
                <dd className="mt-0.5">{formatCents(totalBy('PAID'))}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="type-kicker">DADOS DE RECEBIMENTO</dt>
                <dd className="mt-0.5 break-all">{affiliate.payoutInfo ? JSON.stringify(affiliate.payoutInfo) : '—'}</dd>
              </div>
            </dl>
          </Chamfer>

          <section>
            <h2 className="type-kicker mb-3">COMISSÕES (ÚLTIMAS 50)</h2>
            {affiliate.commissions.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhuma comissão.</p>
            ) : (
              <Table head={['PEDIDO', 'VALOR', 'STATUS', 'LIBERA EM', 'PAGA EM', 'CRIADA']}>
                {affiliate.commissions.map((c) => (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/admin/pedidos/${c.order.id}`} className="underline">
                        {c.order.id.slice(0, 10)}…
                      </Link>
                    </Td>
                    <Td className="text-ink-1">{formatCents(c.amountCents)}</Td>
                    <Td>
                      <StatusTag tone={toneFor(c.status)}>{c.status}</StatusTag>
                    </Td>
                    <Td>{fmtDate(c.approvesAt)}</Td>
                    <Td>{fmtDate(c.paidAt)}</Td>
                    <Td>{fmtDate(c.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <section>
            <h2 className="type-kicker mb-3">SAQUES (ÚLTIMOS 20)</h2>
            {affiliate.payouts.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhum saque solicitado.</p>
            ) : (
              <Table head={['VALOR', 'STATUS', 'PIX', 'SOLICITADO', 'PROCESSADO', 'NOTA']}>
                {affiliate.payouts.map((p) => (
                  <tr key={p.id}>
                    <Td className="text-ink-1">{formatCents(p.amountCents)}</Td>
                    <Td>
                      <StatusTag tone={toneFor(p.status)}>{p.status}</StatusTag>
                    </Td>
                    <Td className="max-w-[160px] truncate">{p.pixKey}</Td>
                    <Td>{fmtDate(p.createdAt)}</Td>
                    <Td>{fmtDate(p.processedAt)}</Td>
                    <Td className="max-w-[200px] whitespace-normal">{p.adminNote ?? '—'}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {affiliate.status !== 'APPROVED' ? (
            <Chamfer cut={6} className="p-4">
              <h2 className="type-kicker mb-2">APROVAR INSCRIÇÃO</h2>
              <form action={setAffiliateStatusAction} className="space-y-2">
                <input type="hidden" name="id" value={affiliate.id} />
                <input type="hidden" name="to" value="APPROVED" />
                <ReasonInput />
                <button type="submit" className="btn btn--primary chamfer w-full">
                  APROVAR
                </button>
              </form>
            </Chamfer>
          ) : null}

          <Chamfer cut={6} className="p-4">
            <h2 className="type-kicker mb-2">COMISSÃO (BASIS POINTS)</h2>
            <p className="mb-2 text-[12px] text-ink-3">1500 bps = 15%</p>
            <form action={setAffiliateCommissionAction} className="space-y-2">
              <input type="hidden" name="id" value={affiliate.id} />
              <input
                name="commissionBps"
                type="number"
                min={0}
                max={5000}
                required
                defaultValue={affiliate.commissionBps}
                aria-label="Comissão em basis points"
                className="field type-mono"
              />
              <ReasonInput />
              <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                ALTERAR COMISSÃO
              </button>
            </form>
          </Chamfer>

          {affiliate.status !== 'SUSPENDED' ? (
            <DangerZone summary="SUSPENDER AFILIADO">
              <p className="text-[13px] text-ink-2">
                Novos pedidos deixam de gerar comissão. Comissões existentes não são alteradas.
              </p>
              <form action={setAffiliateStatusAction} className="space-y-2">
                <input type="hidden" name="id" value={affiliate.id} />
                <input type="hidden" name="to" value="SUSPENDED" />
                <ReasonInput placeholder="Motivo da suspensão (obrigatório)" />
                <button type="submit" className="btn btn--danger chamfer w-full">
                  CONFIRMAR SUSPENSÃO
                </button>
              </form>
            </DangerZone>
          ) : null}
        </aside>
      </div>
    </>
  )
}
