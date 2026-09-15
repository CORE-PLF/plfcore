import Link from 'next/link'
import type { Prisma } from '@/generated/prisma/client'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, SearchForm, Table, Td, fmtDate, pageOf, spStr, toneFor, type SP } from '../../_ui'

export default async function AdminAffiliatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams
  const q = spStr(sp, 'q')
  const page = pageOf(sp)

  const where: Prisma.AffiliateWhereInput = q
    ? { OR: [{ code: { contains: q } }, { user: { email: { contains: q } } }] }
    : {}

  const affiliates = await db.affiliate.findMany({
    where,
    include: {
      user: { select: { email: true } },
      _count: { select: { clicks: true, orders: true, commissions: true, payouts: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = affiliates.length > PER_PAGE
  const rows = affiliates.slice(0, PER_PAGE)

  return (
    <>
      <PageTitle kicker="AFILIADOS" title="PROGRAMA DE INDICAÇÃO">
        <Link href="/admin/afiliados/saques" className="btn btn--ghost btn--sm chamfer">
          FILA DE SAQUES
        </Link>
      </PageTitle>
      <Flash sp={sp} />
      <SearchForm path="/admin/afiliados" sp={sp} placeholder="Código ou e-mail" />

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum afiliado encontrado.</p>
      ) : (
        <Table head={['CÓDIGO', 'E-MAIL', 'STATUS', 'COMISSÃO', 'CLIQUES', 'PEDIDOS', 'COMISSÕES', 'DESDE']}>
          {rows.map((a) => (
            <tr key={a.id}>
              <Td>
                <Link href={`/admin/afiliados/${a.id}`} className="text-ink-1 underline">
                  {a.code}
                </Link>
              </Td>
              <Td>{a.user.email}</Td>
              <Td>
                <StatusTag tone={toneFor(a.status)}>{a.status}</StatusTag>
              </Td>
              <Td>{(a.commissionBps / 100).toFixed(2).replace('.', ',')}%</Td>
              <Td>{a._count.clicks}</Td>
              <Td>{a._count.orders}</Td>
              <Td>{a._count.commissions}</Td>
              <Td>{fmtDate(a.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/afiliados" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
