import Link from 'next/link'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { discordConfigured } from '@/lib/env'
import { licenseDisplayState } from '@/lib/licensing'
import { formatCents } from '@/lib/money'
import { Kicker, Notice, ProgressBar, StatusTag, Surface, SurfaceHead } from '@/components/ui'
import { DISPLAY_TAG, ORDER_TAG, REJECTED_EVENT, cmpVersion, fmtDate, fmtDateTime } from './helpers'

export default async function PainelPage() {
  const user = await requireUser()
  const [licensesRaw, recentOrders, pendingOrder, latestVersion] = await Promise.all([
    db.license.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        devices: { where: { revokedAt: null } },
        events: { where: { type: REJECTED_EVENT }, take: 1, select: { id: true } },
      },
    }),
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { plan: true },
    }),
    db.order.findFirst({
      where: { userId: user.id, status: { in: ['PENDING', 'AWAITING_PAYMENT'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    }),
    db.appVersion.findFirst({
      where: { active: true, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
    }),
  ])

  const licenses = licensesRaw.map((l) => ({
    ...l,
    state: licenseDisplayState(l, l.events.length > 0),
  }))
  const utilizaveis = licenses.filter((l) => l.state === 'ATIVA' || l.state === 'SEM_ATIVACAO')
  const encerradas = licenses.length - utilizaveis.length
  // principal = a licença que o cliente usa hoje (ativa antes de pendente)
  const principal = utilizaveis.find((l) => l.state === 'ATIVA') ?? utilizaveis[0] ?? licenses[0]

  const now = Date.now()
  const diasRestantes =
    principal?.expiresAt != null
      ? Math.max(0, Math.ceil((principal.expiresAt.getTime() - now) / 86400_000))
      : null

  let progresso: { decorrido: number; total: number } | null = null
  if (principal?.activatedAt && principal.expiresAt) {
    const total = principal.expiresAt.getTime() - principal.activatedAt.getTime()
    if (total > 0) {
      progresso = {
        decorrido: Math.min(Math.max(now - principal.activatedAt.getTime(), 0), total),
        total,
      }
    }
  }

  const versaoInstalada = principal?.devices
    .map((d) => d.appVersion)
    .filter((v): v is string => Boolean(v))
    .sort(cmpVersion)
    .at(-1)
  const temAtualizacao = Boolean(
    latestVersion && versaoInstalada && cmpVersion(latestVersion.version, versaoInstalada) > 0,
  )

  const alertas: { chave: string; texto: string; cta?: { href: string; label: string } }[] = []
  if (principal?.state === 'ATIVA' && diasRestantes !== null && diasRestantes <= 7)
    alertas.push({
      chave: 'vencimento',
      texto:
        diasRestantes === 0
          ? 'Sua licença vence hoje. Renove para não perder o acesso.'
          : `Sua licença vence em ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}. Renove para não perder o acesso.`,
      cta: { href: '/painel/planos', label: 'RENOVAR' },
    })
  if (pendingOrder)
    alertas.push({
      chave: 'pedido',
      texto: `Pedido do plano ${pendingOrder.plan.name} aguardando pagamento.`,
      cta: { href: `/painel/pedidos/${pendingOrder.id}`, label: 'VER PEDIDO' },
    })
  if (!user.discordId && discordConfigured())
    alertas.push({
      chave: 'discord',
      texto: 'Discord não vinculado. Vincule para receber avisos por DM.',
      cta: { href: '/api/auth/discord?link=1', label: 'VINCULAR' },
    })
  if (temAtualizacao && latestVersion)
    alertas.push({
      chave: 'versao',
      texto: `Nova versão do app disponível: ${latestVersion.version} (instalada: ${versaoInstalada}).`,
      cta: { href: '/download', label: 'BAIXAR' },
    })

  return (
    <div>
      <header className="mb-6">
        <Kicker>PAINEL</Kicker>
        <h1 className="type-display text-3xl">Visão geral</h1>
      </header>

      {alertas.length > 0 && (
        <ul className="mb-6 space-y-2">
          {alertas.map((a) => (
            <li key={a.chave}>
              <Notice title="Aviso">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p>{a.texto}</p>
                  {a.cta && (
                    <Link href={a.cta.href} className="btn btn--ghost btn--sm">
                      {a.cta.label}
                    </Link>
                  )}
                </div>
              </Notice>
            </li>
          ))}
        </ul>
      )}

      <Surface>
        <SurfaceHead aside={principal ? DISPLAY_TAG[principal.state].label : undefined}>Licença principal</SurfaceHead>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {principal ? (
                <>
                  <p className="text-xl font-bold text-ink-1">{principal.plan.name}</p>
                  <div className="mt-2">
                    <StatusTag tone={DISPLAY_TAG[principal.state].tone}>
                      {DISPLAY_TAG[principal.state].label}
                    </StatusTag>
                  </div>
                </>
              ) : (
                <p className="text-xl font-bold text-ink-1">Nenhuma licença</p>
              )}
            </div>

            {principal && (
              <div className="text-right">
                {principal.expiresAt === null ? (
                  principal.state === 'SEM_ATIVACAO' ? (
                    <p className="max-w-56 text-sm text-ink-3">O prazo começa a contar na primeira ativação no app.</p>
                  ) : (
                    <p className="type-display text-3xl">Vitalícia</p>
                  )
                ) : (
                  <>
                    <p className="type-num text-5xl font-bold leading-none text-ink-1">{diasRestantes}</p>
                    <p className="type-kicker mt-1.5">
                      DIA{diasRestantes === 1 ? '' : 'S'} RESTANTE{diasRestantes === 1 ? '' : 'S'}
                    </p>
                    <p className="type-num mt-1 text-xs text-ink-3">VENCE EM {fmtDate(principal.expiresAt)}</p>
                  </>
                )}
              </div>
            )}
          </div>

          {progresso && (
            <div className="mt-5">
              <ProgressBar value={progresso.decorrido} max={progresso.total} label="Tempo decorrido da licença" />
              <p className="type-kicker mt-1.5">TEMPO DECORRIDO</p>
            </div>
          )}

          {principal && (
            <dl className="mt-4">
              <div className="datarow">
                <dt>Último uso</dt>
                <dd>{principal.lastValidatedAt ? fmtDateTime(principal.lastValidatedAt) : 'SEM REGISTRO'}</dd>
              </div>
            </dl>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {principal && (
              <Link href="/painel/planos" className="btn btn--primary">
                RENOVAR
              </Link>
            )}
            <Link href="/download" className="btn btn--ghost">
              BAIXAR APP
            </Link>
            <Link href="/painel/planos?intent=nova" className={`btn ${principal ? 'btn--ghost' : 'btn--primary'}`}>
              ADQUIRIR NOVA LICENÇA
            </Link>
            {principal && (
              <Link href="/painel/licenca" className="btn btn--ghost">
                VER LICENÇAS
              </Link>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Adquirir nova licença: para Windows formatado ou novo computador.
          </p>
        </div>
      </Surface>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Surface flat className="p-5">
          <Kicker>LICENÇAS UTILIZÁVEIS</Kicker>
          <p className="type-num mt-2 text-4xl font-bold text-ink-1">{utilizaveis.length}</p>
          <p className="mt-1 text-xs text-ink-3">Ativas ou aguardando a primeira ativação.</p>
        </Surface>
        <Surface flat className="p-5">
          <Kicker>CONSUMIDAS / ENCERRADAS</Kicker>
          <p className="type-num mt-2 text-4xl font-bold text-ink-1">{encerradas}</p>
          <p className="mt-1 text-xs text-ink-3">
            Consumidas em outra instalação, expiradas, suspensas ou revogadas.
          </p>
        </Surface>
      </div>

      <Surface className="mt-6">
        <SurfaceHead
          aside={
            <Link href="/painel/pedidos" className="btn btn--ghost btn--sm">
              VER TODOS
            </Link>
          }
        >
          Pedidos recentes
        </SurfaceHead>
        <div className="p-5">
          {recentOrders.length === 0 ? (
            <p className="text-sm text-ink-3">Nenhum pedido até agora.</p>
          ) : (
            <ul className="space-y-2">
              {recentOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="type-num text-xs text-ink-3">{fmtDateTime(order.createdAt)}</span>
                  <Link href={`/painel/pedidos/${order.id}`} className="text-ink-1 hover:underline">
                    {order.plan.name}
                  </Link>
                  <span className="type-num text-ink-2">{formatCents(order.totalCents, order.currency)}</span>
                  <StatusTag tone={ORDER_TAG[order.status].tone}>{ORDER_TAG[order.status].label}</StatusTag>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Surface>
    </div>
  )
}
