import Link from 'next/link'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { licenseDisplayState, maskHwid } from '@/lib/licensing'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'
import { Kicker, Notice, StatusTag, Surface, SurfaceHead } from '@/components/ui'
import { DISPLAY_TAG, REJECTED_EVENT, fmtDate, fmtDateTime } from '../helpers'
import { RevealKey } from './reveal-key'

const EVENT_LABEL: Record<string, string> = {
  ISSUED: 'EMITIDA',
  ACTIVATED: 'ATIVADA',
  EXTENDED: 'RENOVADA',
  ACTIVATION_REJECTED_NEW_INSTALL: 'TENTATIVA DE ATIVAÇÃO EM OUTRA INSTALAÇÃO',
  KEY_VIEWED: 'CHAVE REVELADA',
  DEVICE_DEACTIVATED: 'DISPOSITIVO DESATIVADO',
  DEVICE_UNLINKED: 'DISPOSITIVO DESVINCULADO',
}

function eventLabel(type: string): string {
  if (EVENT_LABEL[type]) return EVENT_LABEL[type]
  if (type.startsWith('SUSPENDED')) return 'SUSPENSA'
  return type
}

export default async function LicencaPage() {
  const user = await requireUser()
  const licensesRaw = await db.license.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      plan: true,
      devices: { where: { revokedAt: null }, orderBy: { firstSeenAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' } },
    },
  })
  const licenses = licensesRaw.map((l) => ({
    ...l,
    state: licenseDisplayState(l, l.events.some((e) => e.type === REJECTED_EVENT)),
  }))

  return (
    <div>
      <header className="mb-6">
        <Kicker>PAINEL</Kicker>
        <h1 className="type-display text-3xl">Licenças</h1>
      </header>

      {licenses.length === 0 && (
        <Surface flat className="p-6">
          <p className="text-ink-2">Você ainda não tem licença.</p>
          <Link href="/planos" className="btn btn--primary mt-4">
            VER PLANOS
          </Link>
        </Surface>
      )}

      <div className="space-y-6">
        {licenses.map((license) => (
          <Surface key={license.id}>
            <SurfaceHead
              aside={<StatusTag tone={DISPLAY_TAG[license.state].tone}>{DISPLAY_TAG[license.state].label}</StatusTag>}
            >
              {license.plan.name}
            </SurfaceHead>
            <div className="p-5">
              {license.state === 'CONSUMIDA_OUTRA_INSTALACAO' && (
                <Notice title="Atenção" role="alert" className="mb-5">
                  <p>
                    Detectamos tentativa de ativação em outra instalação. Esta chave continua valendo
                    APENAS na instalação original. Para o novo Windows, adquira uma nova licença.
                  </p>
                  <Link href="/planos?intent=nova" className="btn btn--primary btn--sm mt-3">
                    ADQUIRIR NOVA LICENÇA
                  </Link>
                </Notice>
              )}

              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <Kicker>CHAVE DE LICENÇA</Kicker>
                <Link href="/download" className="btn btn--ghost btn--sm">
                  BAIXAR APP
                </Link>
              </div>
              <RevealKey licenseId={license.id} masked={license.keyMasked} />
              <p className="mt-2 text-xs text-ink-3">
                Nunca compartilhe sua chave. Cada revelação fica registrada no histórico da conta.
              </p>

              <div className="mt-5">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <Kicker>INSTALAÇÃO VINCULADA</Kicker>
                  <span className="type-num text-xs text-ink-3">
                    INSTALAÇÕES: {license.devices.length} DE {license.deviceLimit}
                  </span>
                </div>
                {license.devices.length === 0 ? (
                  <p className="text-sm text-ink-3">
                    Nenhuma instalação vinculada. A vinculação acontece na primeira ativação dentro do
                    app.
                  </p>
                ) : (
                  license.devices.map((device) => (
                    <dl key={device.id} className="grid gap-px sm:grid-cols-2">
                      <div className="datarow">
                        <dt>Dispositivo</dt>
                        <dd className="normal-case">{device.name ?? 'SEM NOME'}</dd>
                      </div>
                      <div className="datarow">
                        <dt>HWID</dt>
                        <dd>{maskHwid(device.hwid)}</dd>
                      </div>
                      <div className="datarow">
                        <dt>Versão do app</dt>
                        <dd>{device.appVersion ?? 'NÃO DISPONÍVEL'}</dd>
                      </div>
                      <div className="datarow">
                        <dt>Primeira ativação</dt>
                        <dd>{fmtDateTime(device.firstSeenAt)}</dd>
                      </div>
                      <div className="datarow">
                        <dt>Último heartbeat</dt>
                        <dd>{fmtDateTime(device.lastSeenAt)}</dd>
                      </div>
                    </dl>
                  ))
                )}
              </div>

              <dl className="mt-5 grid gap-px sm:grid-cols-3">
                <div className="datarow">
                  <dt>Validade</dt>
                  <dd>
                    {license.expiresAt
                      ? fmtDate(license.expiresAt)
                      : license.state === 'SEM_ATIVACAO'
                        ? 'INICIA NA ATIVAÇÃO'
                        : 'VITALÍCIA'}
                  </dd>
                </div>
                <div className="datarow">
                  <dt>Ativada em</dt>
                  <dd>{license.activatedAt ? fmtDate(license.activatedAt) : 'NÃO ATIVADA'}</dd>
                </div>
                <div className="datarow">
                  <dt>Último uso</dt>
                  <dd>{license.lastValidatedAt ? fmtDateTime(license.lastValidatedAt) : 'SEM REGISTRO'}</dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-line pt-4">
                <Kicker className="mb-2">HISTÓRICO</Kicker>
                {license.events.length === 0 ? (
                  <p className="text-sm text-ink-3">Sem eventos registrados.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {license.events.map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                        <span className="type-num text-xs text-ink-3">{fmtDateTime(ev.createdAt)}</span>
                        <span className="text-ink-2">{eventLabel(ev.type)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Surface>
        ))}
      </div>

      <Notice className="mt-6" title="Licença por instalação">
        <p>{AVISO_LICENCA_INSTALACAO}</p>
      </Notice>
    </div>
  )
}
