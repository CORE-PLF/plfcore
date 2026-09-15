import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { assignTicketAction, setTicketStatusAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { Flash, fmtDate, toneFor, type SP } from '../../../_ui'
import { ReplyForm } from './reply-form'

export default async function AdminTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  const staff = await requireStaff('SUPPORT')
  const { id } = await params
  const sp = await searchParams

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!ticket) notFound()

  const authorIds = [...new Set(ticket.messages.map((m) => m.authorUserId))]
  if (ticket.assignedToUserId) authorIds.push(ticket.assignedToUserId)
  const authors = new Map(
    (await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })).map((u) => [
      u.id,
      u.name,
    ]),
  )

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/tickets" className="underline">TICKETS</Link> / DETALHE
        </p>
        <h1 className="type-display mt-1 flex flex-wrap items-center gap-3 text-3xl">
          {ticket.subject}
          <StatusTag tone={toneFor(ticket.status)}>{ticket.status}</StatusTag>
          <StatusTag tone={toneFor(ticket.priority)}>{ticket.priority}</StatusTag>
        </h1>
        <p className="type-mono mt-2 text-[12px] text-ink-3">
          <Link href={`/admin/usuarios/${ticket.user.id}`} className="underline">
            {ticket.user.email}
          </Link>
          {' — '}categoria: {ticket.category} — aberto em {fmtDate(ticket.createdAt)} — responsável:{' '}
          {ticket.assignedToUserId ? (authors.get(ticket.assignedToUserId) ?? ticket.assignedToUserId) : 'ninguém'}
        </p>
      </header>
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {ticket.messages.map((m) => (
            <Chamfer key={m.id} cut={6} className="p-4" flat={!m.isStaff}>
              <p className="type-kicker mb-2">
                {m.isStaff ? 'SUPORTE' : 'CLIENTE'} — {authors.get(m.authorUserId) ?? m.authorUserId} —{' '}
                {fmtDate(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-sm text-ink-1">{m.body}</p>
            </Chamfer>
          ))}

          <Chamfer cut={8} className="p-4">
            <h2 className="type-kicker mb-3">RESPONDER</h2>
            <ReplyForm ticketId={ticket.id} currentStatus={ticket.status} />
          </Chamfer>
        </div>

        <aside className="space-y-4">
          {ticket.assignedToUserId !== staff.id ? (
            <Chamfer cut={6} className="p-4">
              <h2 className="type-kicker mb-2">ASSUMIR TICKET</h2>
              <form action={assignTicketAction}>
                <input type="hidden" name="id" value={ticket.id} />
                <button type="submit" className="btn btn--primary chamfer w-full">
                  ASSUMIR
                </button>
              </form>
            </Chamfer>
          ) : null}

          <Chamfer cut={6} className="p-4">
            <h2 className="type-kicker mb-2">MUDAR STATUS</h2>
            <form action={setTicketStatusAction} className="space-y-2">
              <input type="hidden" name="id" value={ticket.id} />
              <select name="status" defaultValue={ticket.status} className="field" aria-label="Novo status">
                <option value="OPEN">OPEN</option>
                <option value="AWAITING_SUPPORT">AWAITING_SUPPORT</option>
                <option value="AWAITING_CUSTOMER">AWAITING_CUSTOMER</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
              <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                APLICAR
              </button>
            </form>
          </Chamfer>
        </aside>
      </div>
    </>
  )
}
