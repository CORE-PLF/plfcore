import Link from 'next/link'
import type { OrderStatus, Prisma } from '@/generated/prisma/client'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, SearchForm, Table, Td, fmtDate, pageOf, spStr, toneFor, type SP } from '../../_ui'

const STATUSES: OrderStatus[] = [
  'PENDING',
  'AWAITING_PAYMENT',
  'PAID',
  'CANCELLED',
  'EXPIRED',
  'IN_REVIEW',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CHARGEBACK',
]

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('SUPPORT')
  const sp = await searchParams
  const q = spStr(sp, 'q')
  const status = spStr(sp, 'status')
  const page = pageOf(sp)

  const where: Prisma.OrderWhereInput = {}
  if (STATUSES.includes(status as OrderStatus)) where.status = status as OrderStatus
  if (q) where.OR = [{ id: q }, { user: { email: { contains: q } } }]

  const orders = await db.order.findMany({
    where,
    include: { user: { select: { email: true } }, plan: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = orders.length > PER_PAGE
  const rows = orders.slice(0, PER_PAGE)

  return (
    <>
      <PageTitle kicker="PEDIDOS" title="VENDAS E COBRANÇAS" />
      <Flash sp={sp} />
      <SearchForm path="/admin/pedidos" sp={sp} placeholder="ID do pedido ou e-mail">
        <select name="status" defaultValue={status} className="field max-w-[220px]" aria-label="Filtrar por status">
          <option value="">TODOS OS STATUS</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </SearchForm>

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum pedido encontrado.</p>
      ) : (
        <Table head={['PEDIDO', 'CLIENTE', 'PLANO', 'TOTAL', 'STATUS', 'CRIADO', 'PAGO']}>
          {rows.map((o) => (
            <tr key={o.id}>
              <Td>
                <Link href={`/admin/pedidos/${o.id}`} className="text-ink-1 underline">
                  {o.id.slice(0, 10)}…
                </Link>
              </Td>
              <Td>{o.user.email}</Td>
              <Td>{o.plan.name}</Td>
              <Td className="text-ink-1">{formatCents(o.totalCents, o.currency)}</Td>
              <Td>
                <StatusTag tone={toneFor(o.status)}>{o.status}</StatusTag>
              </Td>
              <Td>{fmtDate(o.createdAt)}</Td>
              <Td>{fmtDate(o.paidAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/pedidos" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
