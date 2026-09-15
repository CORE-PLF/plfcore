import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import {
  debitResellerCreditsAction,
  grantResellerCreditsAction,
  setResellerStatusAction,
  updateResellerAction,
} from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { DangerZone, Flash, ReasonInput, Table, Td, fmtDate, toneFor, type SP } from '../../../_ui'

export default async function AdminResellerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  await requireStaff('ADMIN')
  const { id } = await params
  const sp = await searchParams

  const reseller = await db.reseller.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      ledger: { orderBy: { createdAt: 'desc' }, take: 50 },
      _count: { select: { licenses: true } },
    },
  })
  if (!reseller) notFound()

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/revendedores" className="underline">REVENDEDORES</Link> / DETALHE
        </p>
        <h1 className="type-display mt-1 flex flex-wrap items-center gap-3 text-3xl">
          {reseller.user.name} <StatusTag tone={toneFor(reseller.status)}>{reseller.status}</StatusTag>
        </h1>
      </header>
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">SALDO DE CRÉDITOS</p>
              <p className="type-mono mt-1 text-lg text-ink-1">{formatCents(reseller.creditBalanceCents)}</p>
            </Chamfer>
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">LICENÇAS EMITIDAS</p>
              <p className="type-mono mt-1 text-lg text-ink-1">{reseller._count.licenses}</p>
            </Chamfer>
            <Chamfer cut={6} className="p-3">
              <p className="type-kicker">USUÁRIO</p>
              <p className="type-mono mt-1 break-all text-[12px]">
                <Link href={`/admin/usuarios/${reseller.user.id}`} className="text-ink-1 underline">
                  {reseller.user.email}
                </Link>
              </p>
            </Chamfer>
          </div>

          <section>
            <h2 className="type-kicker mb-3">LEDGER (ÚLTIMOS 50 LANÇAMENTOS)</h2>
            {reseller.ledger.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhum lançamento.</p>
            ) : (
              <Table head={['QUANDO', 'TIPO', 'DELTA', 'SALDO APÓS', 'REF', 'NOTA']}>
                {reseller.ledger.map((l) => (
                  <tr key={l.id}>
                    <Td>{fmtDate(l.createdAt)}</Td>
                    <Td>{l.type}</Td>
                    <Td className={l.deltaCents < 0 ? 'text-signal' : 'text-ink-1'}>
                      {l.deltaCents < 0 ? '-' : '+'}
                      {formatCents(Math.abs(l.deltaCents))}
                    </Td>
                    <Td>{formatCents(l.balanceAfter)}</Td>
                    <Td className="max-w-[140px] truncate">
                      {l.refLicenseId ? (
                        <Link href={`/admin/licencas/${l.refLicenseId}`} className="underline">
                          licença
                        </Link>
                      ) : l.refOrderId ? (
                        <Link href={`/admin/pedidos/${l.refOrderId}`} className="underline">
                          pedido
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="max-w-[220px] whitespace-normal">{l.note ?? '—'}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {reseller.status !== 'APPROVED' ? (
            <Chamfer cut={6} className="p-4">
              <h2 className="type-kicker mb-2">APROVAR REVENDEDOR</h2>
              <form action={setResellerStatusAction} className="space-y-2">
                <input type="hidden" name="id" value={reseller.id} />
                <input type="hidden" name="to" value="APPROVED" />
                <ReasonInput />
                <button type="submit" className="btn btn--primary chamfer w-full">
                  APROVAR
                </button>
              </form>
            </Chamfer>
          ) : null}

          <Chamfer cut={6} className="p-4">
            <h2 className="type-kicker mb-2">DADOS COMERCIAIS</h2>
            <form action={updateResellerAction} className="space-y-2">
              <input type="hidden" name="id" value={reseller.id} />
              <label className="type-kicker block">TIER</label>
              <input name="tier" type="number" min={1} max={10} required defaultValue={reseller.tier} className="field type-mono" />
              <label className="type-kicker block">DESCONTO (BPS — 2000 = 20%)</label>
              <input
                name="discountBps"
                type="number"
                min={0}
                max={9000}
                required
                defaultValue={reseller.discountBps}
                className="field type-mono"
              />
              <label className="type-kicker block">LIMITE DIÁRIO DE EMISSÃO</label>
              <input
                name="dailyIssueLimit"
                type="number"
                min={0}
                required
                defaultValue={reseller.dailyIssueLimit}
                className="field type-mono"
              />
              <label className="type-kicker block">LIMITE MENSAL DE EMISSÃO</label>
              <input
                name="monthlyIssueLimit"
                type="number"
                min={0}
                required
                defaultValue={reseller.monthlyIssueLimit}
                className="field type-mono"
              />
              <ReasonInput />
              <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                SALVAR DADOS
              </button>
            </form>
          </Chamfer>

          <Chamfer cut={6} className="p-4">
            <h2 className="type-kicker mb-2">CONCEDER CRÉDITOS</h2>
            <form action={grantResellerCreditsAction} className="space-y-2">
              <input type="hidden" name="id" value={reseller.id} />
              <input
                name="amount"
                required
                inputMode="decimal"
                placeholder="Valor (R$) — ex.: 500,00"
                aria-label="Valor em reais"
                className="field type-mono"
              />
              <ReasonInput />
              <button type="submit" className="btn btn--primary chamfer w-full">
                CONCEDER
              </button>
            </form>
          </Chamfer>

          <DangerZone summary="DEBITAR CRÉDITOS">
            <p className="text-[13px] text-ink-2">
              Remove créditos do saldo com lançamento ADMIN_ADJUST negativo no ledger. Falha se o saldo for menor que o
              valor.
            </p>
            <form action={debitResellerCreditsAction} className="space-y-2">
              <input type="hidden" name="id" value={reseller.id} />
              <input
                name="amount"
                required
                inputMode="decimal"
                placeholder="Valor (R$) — ex.: 100,00"
                aria-label="Valor em reais"
                className="field type-mono"
              />
              <ReasonInput placeholder="Motivo do débito (obrigatório)" />
              <button type="submit" className="btn btn--danger chamfer w-full">
                CONFIRMAR DÉBITO
              </button>
            </form>
          </DangerZone>

          {reseller.status !== 'SUSPENDED' ? (
            <DangerZone summary="SUSPENDER REVENDEDOR">
              <p className="text-[13px] text-ink-2">Bloqueia novas emissões. O saldo permanece registrado.</p>
              <form action={setResellerStatusAction} className="space-y-2">
                <input type="hidden" name="id" value={reseller.id} />
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
