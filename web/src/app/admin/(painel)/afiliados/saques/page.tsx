import Link from 'next/link'
import type { PayoutStatus, Prisma } from '@/generated/prisma/client'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { approvePayoutAction, markPayoutPaidAction, rejectPayoutAction } from '@/lib/actions/admin'
import { StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, Table, Td, fmtDate, pageOf, spStr, toneFor, type SP } from '../../../_ui'

const STATUSES: PayoutStatus[] = ['REQUESTED', 'APPROVED', 'PAID', 'REJECTED']

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams
  const status = spStr(sp, 'status')
  const page = pageOf(sp)

  const where: Prisma.PayoutRequestWhereInput = STATUSES.includes(status as PayoutStatus)
    ? { status: status as PayoutStatus }
    : {}

  const payouts = await db.payoutRequest.findMany({
    where,
    include: { affiliate: { include: { user: { select: { email: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = payouts.length > PER_PAGE
  const rows = payouts.slice(0, PER_PAGE)

  return (
    <>
      <PageTitle kicker="AFILIADOS" title="FILA DE SAQUES">
        <Link href="/admin/afiliados" className="btn btn--ghost btn--sm chamfer">
          VOLTAR PARA AFILIADOS
        </Link>
      </PageTitle>
      <Flash sp={sp} />

      <form action="/admin/afiliados/saques" method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status} className="field max-w-[220px]" aria-label="Filtrar por status">
          <option value="">TODOS OS STATUS</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn--ghost btn--sm chamfer">
          FILTRAR
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum saque na fila.</p>
      ) : (
        <Table head={['AFILIADO', 'VALOR', 'PIX', 'STATUS', 'SOLICITADO', 'AÇÕES']}>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td>
                <Link href={`/admin/afiliados/${p.affiliateId}`} className="text-ink-1 underline">
                  {p.affiliate.code}
                </Link>
                <span className="ml-2 text-ink-3">{p.affiliate.user.email}</span>
              </Td>
              <Td className="text-ink-1">{formatCents(p.amountCents)}</Td>
              <Td className="max-w-[160px] truncate">{p.pixKey}</Td>
              <Td>
                <StatusTag tone={toneFor(p.status)}>{p.status}</StatusTag>
                {p.adminNote ? <span className="ml-2 text-ink-3">{p.adminNote}</span> : null}
              </Td>
              <Td>{fmtDate(p.createdAt)}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  {p.status === 'REQUESTED' ? (
                    <form action={approvePayoutAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="btn btn--primary btn--sm chamfer">
                        APROVAR
                      </button>
                    </form>
                  ) : null}
                  {p.status === 'APPROVED' ? (
                    <form action={markPayoutPaidAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="btn btn--primary btn--sm chamfer">
                        MARCAR PAGO
                      </button>
                    </form>
                  ) : null}
                  {p.status === 'REQUESTED' || p.status === 'APPROVED' ? (
                    <form action={rejectPayoutAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        name="reason"
                        required
                        minLength={4}
                        placeholder="Motivo da rejeição"
                        aria-label="Motivo da rejeição"
                        className="field min-h-[34px] w-44 py-1 text-[12px]"
                      />
                      <button type="submit" className="btn btn--danger btn--sm chamfer">
                        REJEITAR
                      </button>
                    </form>
                  ) : null}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/afiliados/saques" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
