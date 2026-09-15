import Link from 'next/link'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { Surface, Kicker, StatusTag } from '@/components/ui'
import { TICKET_TAG, categoryLabel, fmtDateTime } from '../helpers'

export default async function SuportePage() {
  const user = await requireUser()
  const tickets = await db.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  })

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>PAINEL</Kicker>
          <h1 className="type-display text-3xl">Suporte</h1>
        </div>
        <Link href="/painel/suporte/novo" className="btn btn--primary btn--sm">
          ABRIR TICKET
        </Link>
      </header>

      {tickets.length === 0 ? (
        <Surface flat className="p-6">
          <p className="text-ink-2">Nenhum ticket aberto. Precisa de ajuda? Abra um ticket.</p>
        </Surface>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/painel/suporte/${t.id}`} className="block">
                <Surface
                 
                  flat
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-[filter] hover:brightness-110"
                >
                  <div className="min-w-0">
                    <p className="truncate text-ink-1">{t.subject}</p>
                    <p className="type-mono mt-0.5 text-xs text-ink-3">
                      {categoryLabel(t.category)} · ATUALIZADO {fmtDateTime(t.updatedAt)}
                    </p>
                  </div>
                  <StatusTag tone={TICKET_TAG[t.status].tone}>{TICKET_TAG[t.status].label}</StatusTag>
                </Surface>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
