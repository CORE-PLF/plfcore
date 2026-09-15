import Link from 'next/link'
import type { Prisma, TicketPriority, TicketStatus } from '@/generated/prisma/client'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, SearchForm, Table, Td, fmtDate, pageOf, spStr, toneFor, type SP } from '../../_ui'

const STATUSES: TicketStatus[] = ['OPEN', 'AWAITING_SUPPORT', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED']
const PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('SUPPORT')
  const sp = await searchParams
  const q = spStr(sp, 'q')
  const status = spStr(sp, 'status')
  const priority = spStr(sp, 'priority')
  const page = pageOf(sp)

  const where: Prisma.SupportTicketWhereInput = {}
  if (STATUSES.includes(status as TicketStatus)) where.status = status as TicketStatus
  if (PRIORITIES.includes(priority as TicketPriority)) where.priority = priority as TicketPriority
  if (q) where.OR = [{ subject: { contains: q } }, { user: { email: { contains: q } } }]

  const tickets = await db.supportTicket.findMany({
    where,
    include: { user: { select: { email: true } }, _count: { select: { messages: true } } },
    orderBy: { updatedAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = tickets.length > PER_PAGE
  const rows = tickets.slice(0, PER_PAGE)

  return (
    <>
      <PageTitle kicker="TICKETS" title="FILA DE SUPORTE" />
      <Flash sp={sp} />
      <SearchForm path="/admin/tickets" sp={sp} placeholder="Assunto ou e-mail">
        <select name="status" defaultValue={status} className="field max-w-[220px]" aria-label="Filtrar por status">
          <option value="">TODOS OS STATUS</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={priority} className="field max-w-[180px]" aria-label="Filtrar por prioridade">
          <option value="">TODAS AS PRIORIDADES</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </SearchForm>

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum ticket na fila.</p>
      ) : (
        <Table head={['ASSUNTO', 'CLIENTE', 'CATEGORIA', 'PRIORIDADE', 'STATUS', 'MSGS', 'ATUALIZADO']}>
          {rows.map((t) => (
            <tr key={t.id}>
              <Td className="max-w-[280px] truncate">
                <Link href={`/admin/tickets/${t.id}`} className="text-ink-1 underline">
                  {t.subject}
                </Link>
              </Td>
              <Td>{t.user.email}</Td>
              <Td>{t.category}</Td>
              <Td>
                <StatusTag tone={toneFor(t.priority)}>{t.priority}</StatusTag>
              </Td>
              <Td>
                <StatusTag tone={toneFor(t.status)}>{t.status}</StatusTag>
              </Td>
              <Td>{t._count.messages}</Td>
              <Td>{fmtDate(t.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/tickets" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
