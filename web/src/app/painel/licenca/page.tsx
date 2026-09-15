import Link from 'next/link'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { licenseDisplayState, maskHwid } from '@/lib/licensing'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'
import { Chamfer, Kicker, RuleFade, StatusTag } from '@/components/ui'
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
        <h1 className="type-display text-3xl">LICENÇAS</h1>
      </header>

      {licenses.length === 0 && (
        <Chamfer cut={8} flat className="p-6">
          <p className="text-ink-2">Você ainda não tem licença.</p>
          <Link href="/planos" className="btn btn--primary chamfer mt-4">
            VER PLANOS
          </Link>
        </Chamfer>
      )}

      <div className="space-y-6">
        {licenses.map((license) => (
          <Chamfer key={license.id} cut={12} className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Kicker>PLANO</Kicker>
                <p className="mt-0.5 text-lg text-ink-1">{license.plan.name}</p>
              </div>
              <StatusTag tone={DISPLAY_TAG[license.state].tone}>
                {DISPLAY_TAG[license.state].label}
              </StatusTag>
            </div>

            {license.state === 'CONSUMIDA_OUTRA_INSTALACAO' && (
              <Chamfer
                cut={6}
                flat
                edge="var(--color-heat)"
                className="mt-4 px-4 py-3"
                role="alert"
              >
                <p className="type-kicker" style={{ color: 'var(--color-heat)' }}>
                  ATENÇÃO
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  Detectamos tentativa de ativação em outra instalação. Esta chave continua valendo
                  APENAS na instalação original. Para o novo Windows, adquira uma nova licença.
                </p>
                <Link href="/planos?intent=nova" className="btn btn--primary btn--sm chamfer mt-3">
                  ADQUIRIR NOVA LICENÇA
                </Link>
              </Chamfer>
            )}

            <div className="mt-5">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <Kicker>CHAVE DE LICENÇA</Kicker>
                <Link href="/download" className="btn btn--sm chamfer">
                  BAIXAR RESYNC
                </Link>
              </div>
              <RevealKey licenseId={license.id} masked={license.keyMasked} />
              <p className="mt-2 text-xs text-ink-3">
                Nunca compartilhe sua chave. Cada revelação fica registrada no histórico da conta.
              </p>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <Kicker>INSTALAÇÃO VINCULADA</Kicker>
                <span className="type-mono text-xs text-ink-3">
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
                  <div
                    key={device.id}
                    className="type-mono grid grid-cols-2 gap-4 px-4 py-3 text-sm sm:grid-cols-3"
                    style={{ background: 'var(--color-void)', boxShadow: 'inset 0 0 0 1px var(--color-edge)' }}
                  >
                    <div>
                      <p className="type-kicker mb-1">DISPOSITIVO</p>
                      <p className="text-ink-1">{device.name ?? 'SEM NOME'}</p>
                    </div>
                    <div>
                      <p className="type-kicker mb-1">HWID</p>
                      <p className="text-ink-1">{maskHwid(device.hwid)}</p>
                    </div>
                    <div>
                      <p className="type-kicker mb-1">VERSÃO DO APP</p>
                      <p className="text-ink-1">{device.appVersion ?? 'NÃO DISPONÍVEL'}</p>
                    </div>
                    <div>
                      <p className="type-kicker mb-1">PRIMEIRA ATIVAÇÃO</p>
                      <p className="text-ink-1">{fmtDateTime(device.firstSeenAt)}</p>
                    </div>
                    <div>
                      <p className="type-kicker mb-1">ÚLTIMO HEARTBEAT</p>
                      <p className="text-ink-1">{fmtDateTime(device.lastSeenAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="type-mono mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="type-kicker mb-1">VALIDADE</p>
                <p className="text-ink-1">
                  {license.expiresAt
                    ? fmtDate(license.expiresAt)
                    : license.state === 'SEM_ATIVACAO'
                      ? 'INICIA NA ATIVAÇÃO'
                      : 'VITALÍCIA'}
                </p>
              </div>
              <div>
                <p className="type-kicker mb-1">ATIVADA EM</p>
                <p className="text-ink-1">
                  {license.activatedAt ? fmtDate(license.activatedAt) : 'NÃO ATIVADA'}
                </p>
              </div>
              <div>
                <p className="type-kicker mb-1">ÚLTIMO USO</p>
                <p className="text-ink-1">
                  {license.lastValidatedAt ? fmtDateTime(license.lastValidatedAt) : 'SEM REGISTRO'}
                </p>
              </div>
            </div>

            <RuleFade className="my-5" />

            <Kicker className="mb-2">HISTÓRICO</Kicker>
            {license.events.length === 0 ? (
              <p className="text-sm text-ink-3">Sem eventos registrados.</p>
            ) : (
              <ul className="space-y-1.5">
                {license.events.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="type-mono text-xs text-ink-3">{fmtDateTime(ev.createdAt)}</span>
                    <span className="text-ink-2">{eventLabel(ev.type)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Chamfer>
        ))}
      </div>

      <Chamfer cut={6} flat className="mt-6 px-4 py-3">
        <p className="type-kicker mb-1">AVISO</p>
        <p className="text-sm text-ink-3">{AVISO_LICENCA_INSTALACAO}</p>
      </Chamfer>
    </div>
  )
}
