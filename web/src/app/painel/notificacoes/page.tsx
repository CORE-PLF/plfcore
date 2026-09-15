import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { marcarLidaAction, marcarTodasLidasAction } from '@/lib/actions/painel'
import { Chamfer, Kicker } from '@/components/ui'
import { fmtDateTime } from '../helpers'

export default async function NotificacoesPage() {
  const user = await requireUser()
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const naoLidas = notifications.filter((n) => !n.readAt).length

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>PAINEL</Kicker>
          <h1 className="type-display text-3xl">NOTIFICAÇÕES</h1>
        </div>
        {naoLidas > 0 && (
          <form action={marcarTodasLidasAction}>
            <button type="submit" className="btn btn--ghost btn--sm chamfer">
              MARCAR TODAS COMO LIDAS
            </button>
          </form>
        )}
      </header>

      {notifications.length === 0 ? (
        <Chamfer cut={8} flat className="p-6">
          <p className="text-ink-2">Nenhuma notificação até agora.</p>
        </Chamfer>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Chamfer
                cut={6}
                flat
                className="px-4 py-3"
                style={n.readAt ? undefined : { boxShadow: 'inset 2px 0 0 var(--color-signal)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={n.readAt ? 'text-ink-3' : 'text-ink-1'}>
                      {!n.readAt && (
                        <span className="type-kicker mr-2" style={{ color: 'var(--color-signal)' }}>
                          NOVA
                        </span>
                      )}
                      {n.title}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-ink-2">{n.body}</p>
                    <p className="type-mono mt-1.5 text-xs text-ink-4">{fmtDateTime(n.createdAt)}</p>
                  </div>
                  {!n.readAt && (
                    <form action={marcarLidaAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="btn btn--ghost btn--sm chamfer">
                        MARCAR COMO LIDA
                      </button>
                    </form>
                  )}
                </div>
              </Chamfer>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
