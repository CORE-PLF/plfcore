import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, SearchForm, Table, Td, fmtDate, pageOf, spStr, type SP } from '../../_ui'

export default async function AdminCouponsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams
  const q = spStr(sp, 'q')
  const page = pageOf(sp)

  const coupons = await db.coupon.findMany({
    where: q ? { code: { contains: q.toUpperCase() } } : {},
    include: { _count: { select: { redemptions: true } }, affiliate: { select: { code: true } } },
    orderBy: { createdAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = coupons.length > PER_PAGE
  const rows = coupons.slice(0, PER_PAGE)

  return (
    <>
      <PageTitle kicker="CUPONS" title="DESCONTOS">
        <Link href="/admin/cupons/novo" className="btn btn--primary btn--sm chamfer">
          NOVO CUPOM
        </Link>
      </PageTitle>
      <Flash sp={sp} />
      <SearchForm path="/admin/cupons" sp={sp} placeholder="Código do cupom" />

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum cupom encontrado.</p>
      ) : (
        <Table head={['CÓDIGO', 'DESCONTO', 'USOS', 'LIMITE', 'JANELA', 'AFILIADO', 'ATIVO', '']}>
          {rows.map((c) => (
            <tr key={c.id}>
              <Td className="text-ink-1">{c.code}</Td>
              <Td>{c.type === 'PERCENT' ? `${(c.value / 100).toFixed(2).replace('.', ',')}%` : formatCents(c.value)}</Td>
              <Td>
                {c._count.redemptions}
                {c.maxRedemptions ? `/${c.maxRedemptions}` : ''}
              </Td>
              <Td>{c.perUserLimit}/usuário</Td>
              <Td>
                {c.startsAt || c.endsAt ? `${c.startsAt ? fmtDate(c.startsAt) : '…'} → ${c.endsAt ? fmtDate(c.endsAt) : '…'}` : 'SEM JANELA'}
              </Td>
              <Td>{c.affiliate?.code ?? '—'}</Td>
              <Td>
                <StatusTag tone={c.active ? 'ok' : 'muted'}>{c.active ? 'ATIVO' : 'INATIVO'}</StatusTag>
              </Td>
              <Td>
                <Link href={`/admin/cupons/${c.id}`} className="btn btn--ghost btn--sm chamfer">
                  EDITAR
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/cupons" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
