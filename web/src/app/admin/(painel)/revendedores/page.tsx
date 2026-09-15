import Link from 'next/link'
import type { Prisma } from '@/generated/prisma/client'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, SearchForm, Table, Td, fmtDate, pageOf, spStr, toneFor, type SP } from '../../_ui'

export default async function AdminResellersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams
  const q = spStr(sp, 'q')
  const page = pageOf(sp)

  const where: Prisma.ResellerWhereInput = q
    ? { user: { OR: [{ email: { contains: q } }, { name: { contains: q } }] } }
    : {}

  const resellers = await db.reseller.findMany({
    where,
    include: { user: { select: { email: true } }, _count: { select: { licenses: true } } },
    orderBy: { createdAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = resellers.length > PER_PAGE
  const rows = resellers.slice(0, PER_PAGE)

  return (
    <>
      <PageTitle kicker="REVENDEDORES" title="CANAL DE REVENDA" />
      <Flash sp={sp} />
      <SearchForm path="/admin/revendedores" sp={sp} placeholder="E-mail ou nome" />

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum revendedor encontrado.</p>
      ) : (
        <Table head={['E-MAIL', 'STATUS', 'TIER', 'DESCONTO', 'SALDO', 'LICENÇAS', 'LIMITES (D/M)', 'DESDE']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td>
                <Link href={`/admin/revendedores/${r.id}`} className="text-ink-1 underline">
                  {r.user.email}
                </Link>
              </Td>
              <Td>
                <StatusTag tone={toneFor(r.status)}>{r.status}</StatusTag>
              </Td>
              <Td>{r.tier}</Td>
              <Td>{(r.discountBps / 100).toFixed(2).replace('.', ',')}%</Td>
              <Td className="text-ink-1">{formatCents(r.creditBalanceCents)}</Td>
              <Td>{r._count.licenses}</Td>
              <Td>
                {r.dailyIssueLimit}/{r.monthlyIssueLimit}
              </Td>
              <Td>{fmtDate(r.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/revendedores" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
