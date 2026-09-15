import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fecharTicketAction, responderTicketAction } from '@/lib/actions/painel'
import { Surface, Kicker, RuleFade, StatusTag } from '@/components/ui'
import {
  TICKET_PRIORITY_LABEL,
  TICKET_TAG,
  categoryLabel,
  firstParam,
  fmtDateTime,
  type SearchParams,
} from '../../helpers'
import { ConfirmSubmit } from '../../confirm-submit'

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const user = await requireUser()
  const { id } = await params
  const erro = firstParam((await searchParams).erro)
  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!ticket || ticket.userId !== user.id) notFound()

  const fechado = ticket.status === 'CLOSED'

  return (
    <div>
      <header className="mb-6">
        <Kicker>
          <Link href="/painel/suporte" className="hover:text-ink-1">
            SUPORTE
          </Link>{' '}
          / TICKET
        </Kicker>
        <h1 className="type-display text-2xl">{ticket.subject}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <StatusTag tone={TICKET_TAG[ticket.status].tone}>{TICKET_TAG[ticket.status].label}</StatusTag>
          <span className="type-mono text-xs text-ink-3">
            {categoryLabel(ticket.category)} · PRIORIDADE {TICKET_PRIORITY_LABEL[ticket.priority]} · ABERTO{' '}
            {fmtDateTime(ticket.createdAt)}
          </span>
        </div>
      </header>

      <ol className="space-y-3">
        {ticket.messages.map((m) => (
          <li key={m.id}>
            <Surface
             
              flat
              className="px-4 py-3"
              style={m.isStaff ? { boxShadow: 'inset 2px 0 0 var(--color-signal)' } : undefined}
            >
              <p className="type-kicker mb-1.5" style={m.isStaff ? { color: 'var(--color-signal)' } : undefined}>
                {m.isStaff ? 'SUPORTE' : 'VOCÊ'}
                <span className="type-mono ml-2 normal-case tracking-normal text-ink-4">
                  {fmtDateTime(m.createdAt)}
                </span>
              </p>
              <p className="whitespace-pre-line text-sm text-ink-2">{m.body}</p>
            </Surface>
          </li>
        ))}
      </ol>

      <RuleFade className="my-6" />

      {fechado ? (
        <Surface flat className="px-4 py-3">
          <p className="text-sm text-ink-2">
            Ticket fechado. Precisa de mais ajuda?{' '}
            <Link href="/painel/suporte/novo" className="text-ink-1 underline">
              Abra um novo ticket
            </Link>
            .
          </p>
        </Surface>
      ) : (
        <div className="space-y-4">
          {erro && (
            <p className="text-sm" style={{ color: 'var(--color-blood)' }} role="alert">
              {erro}
            </p>
          )}
          <form action={responderTicketAction} className="space-y-3">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <label htmlFor="mensagem" className="type-kicker block">
              RESPONDER
            </label>
            <textarea
              id="mensagem"
              name="mensagem"
              required
              minLength={2}
              maxLength={5000}
              rows={4}
              className="field"
              placeholder="Sua resposta. Chaves de licença são mascaradas automaticamente."
            />
            <button type="submit" className="btn btn--primary">
              ENVIAR
            </button>
          </form>

          <form action={fecharTicketAction}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <ConfirmSubmit
              message="Fechar este ticket? Você poderá abrir outro depois, mas este não aceitará novas respostas."
              className="btn btn--ghost btn--sm"
            >
              FECHAR TICKET
            </ConfirmSubmit>
          </form>
        </div>
      )}
    </div>
  )
}
