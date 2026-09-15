import Link from 'next/link'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { licenseDisplayState, maskHwid, type LicenseDisplayState } from '@/lib/licensing'
import { Surface, Kicker, StatusTag } from '@/components/ui'
import { REJECTED_EVENT, fmtDateTime, type Tone } from '../helpers'

// estado do dispositivo = estado derivado da licença + revokedAt do próprio device
const DEVICE_TAG: Record<LicenseDisplayState, { label: string; tone: Tone }> = {
  SEM_ATIVACAO: { label: 'SEM ATIVAÇÃO', tone: 'muted' },
  ATIVA: { label: 'ATIVO', tone: 'ok' },
  CONSUMIDA_OUTRA_INSTALACAO: { label: 'CONSUMIDO', tone: 'warn' },
  EXPIRADA: { label: 'EXPIRADO', tone: 'danger' },
  SUSPENSA: { label: 'SUSPENSO', tone: 'danger' },
  REVOGADA: { label: 'REVOGADO', tone: 'danger' },
  BLOQUEADA: { label: 'BLOQUEADO', tone: 'danger' },
  SUBSTITUIDA: { label: 'SUBSTITUÍDO', tone: 'muted' },
}

export default async function DispositivosPage() {
  const user = await requireUser()
  const licensesRaw = await db.license.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      plan: true,
      devices: { orderBy: { firstSeenAt: 'desc' } },
      events: { where: { type: REJECTED_EVENT }, take: 1, select: { id: true } },
    },
  })
  const licenses = licensesRaw.map((l) => ({
    ...l,
    state: licenseDisplayState(l, l.events.length > 0),
  }))

  return (
    <div>
      <header className="mb-6">
        <Kicker>PAINEL</Kicker>
        <h1 className="type-display text-3xl">Dispositivos</h1>
      </header>

      {licenses.length === 0 && (
        <Surface flat className="p-6">
          <p className="text-ink-2">Sem licença — nenhum dispositivo para exibir.</p>
          <Link href="/planos" className="btn btn--primary mt-4">
            VER PLANOS
          </Link>
        </Surface>
      )}

      <div className="space-y-6">
        {licenses.map((license) => (
          <Surface key={license.id} className="p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-ink-1">{license.plan.name}</p>
              <StatusTag tone={DEVICE_TAG[license.state].tone}>
                {DEVICE_TAG[license.state].label}
              </StatusTag>
            </div>

            {license.devices.length === 0 ? (
              <p className="mt-4 text-sm text-ink-3">
                Nenhuma instalação vinculada. A vinculação acontece na primeira ativação dentro do
                app.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {license.devices.map((device) => {
                  const tag = device.revokedAt
                    ? { label: 'REVOGADO', tone: 'muted' as Tone }
                    : DEVICE_TAG[license.state]
                  return (
                    <li
                      key={device.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      style={{ background: 'var(--color-void)', border: '1px solid var(--color-edge)', borderRadius: 6 }}
                    >
                      <div>
                        <p className="text-ink-1">{device.name ?? 'DISPOSITIVO SEM NOME'}</p>
                        <p className="type-mono mt-0.5 text-xs text-ink-3">
                          HWID {maskHwid(device.hwid)} · PRIMEIRA ATIVAÇÃO{' '}
                          {fmtDateTime(device.firstSeenAt)} · ÚLTIMO HEARTBEAT{' '}
                          {fmtDateTime(device.lastSeenAt)}
                        </p>
                      </div>
                      <StatusTag tone={tag.tone}>{tag.label}</StatusTag>
                    </li>
                  )
                })}
              </ul>
            )}
          </Surface>
        ))}
      </div>

      <Surface flat className="mt-6 px-4 py-3">
        <p className="type-kicker mb-1">TROCA DE INSTALAÇÃO</p>
        <p className="text-sm text-ink-3">
          A troca de instalação não é automática: formatar o Windows exige nova licença. Precisa de
          uma exceção?{' '}
          <Link href="/painel/suporte/novo" className="text-ink-1 underline">
            Abra um chamado no suporte
          </Link>
          .
        </p>
      </Surface>
    </div>
  )
}
