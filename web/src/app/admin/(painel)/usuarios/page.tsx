import Link from 'next/link'
import type { Prisma } from '@/generated/prisma/client'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, SearchForm, Table, Td, fmtDate, pageOf, spStr, toneFor, type SP } from '../../_ui'

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('SUPPORT')
  const sp = await searchParams
  const q = spStr(sp, 'q')
  const page = pageOf(sp)

  const where: Prisma.UserWhereInput = q
    ? { OR: [{ id: q }, { email: { contains: q } }, { name: { contains: q } }, { discordUsername: { contains: q } }] }
    : {}

  const users = await db.user.findMany({
    where,
    include: { _count: { select: { orders: true, licenses: true, tickets: true } } },
    orderBy: { createdAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = users.length > PER_PAGE
  const rows = users.slice(0, PER_PAGE)

  return (
    <>
      <PageTitle kicker="USUÁRIOS" title="CONTAS" />
      <Flash sp={sp} />
      <SearchForm path="/admin/usuarios" sp={sp} placeholder="E-mail, nome ou Discord" />

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum usuário encontrado.</p>
      ) : (
        <Table head={['E-MAIL', 'NOME', 'STATUS', 'PAPEL', 'PEDIDOS', 'LICENÇAS', 'TICKETS', 'CRIADO']}>
          {rows.map((u) => (
            <tr key={u.id}>
              <Td>
                <Link href={`/admin/usuarios/${u.id}`} className="text-ink-1 underline">
                  {u.email}
                </Link>
              </Td>
              <Td>{u.name}</Td>
              <Td>
                <StatusTag tone={toneFor(u.status)}>{u.status}</StatusTag>
              </Td>
              <Td>{u.staffRole === 'NONE' ? '—' : u.staffRole}</Td>
              <Td>{u._count.orders}</Td>
              <Td>{u._count.licenses}</Td>
              <Td>{u._count.tickets}</Td>
              <Td>{fmtDate(u.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/usuarios" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
