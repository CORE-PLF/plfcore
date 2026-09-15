import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { hasStaffRole, requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { licenseDisplayState, maskHwid } from '@/lib/licensing'
import {
  extendLicenseAction,
  setDeviceLimitAction,
  setLicenseStatusAction,
  unlinkDeviceAction,
} from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { DangerZone, Flash, ReasonInput, STATE_LABELS, Table, Td, fmtDate, maskJsonHwid, toneFor, type SP } from '../../../_ui'

export default async function AdminLicenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  const staff = await requireStaff('SUPPORT')
  const { id } = await params
  const sp = await searchParams

  const license = await db.license.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      plan: { select: { name: true, slug: true } },
      order: { select: { id: true, status: true, licenseIntent: true } },
      reseller: { select: { id: true, user: { select: { email: true } } } },
      devices: { orderBy: { firstSeenAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  })
  if (!license) notFound()
  // busca própria (não os últimos 50 eventos): tentativa antiga não pode sumir da tela
  const rejected = await db.licenseEvent.findMany({
    where: { licenseId: id, type: 'ACTIVATION_REJECTED_NEW_INSTALL' },
    orderBy: { createdAt: 'desc' },
  })
  const estado = licenseDisplayState(license, rejected.length > 0)
  const isAdmin = hasStaffRole(staff, 'ADMIN')
  const activeDevices = license.devices.filter((d) => !d.revokedAt)

  const info: [string, ReactNode][] = [
    ['CHAVE (MASCARADA)', license.keyMasked],
    ['STATUS (BANCO)', license.status],
    ['CLIENTE', <Link key="u" href={`/admin/usuarios/${license.user.id}`} className="text-ink-1 underline">{license.user.email}</Link>],
    ['PLANO', `${license.plan.name} (${license.plan.slug})`],
    ['PEDIDO', license.order ? <Link key="o" href={`/admin/pedidos/${license.order.id}`} className="underline">{license.order.id.slice(0, 10)}… ({license.order.status} · {license.order.licenseIntent === 'NEW_INSTALL' ? 'INSTALAÇÃO NOVA' : 'RENOVAÇÃO'})</Link> : '—'],
    ['REVENDEDOR', license.reseller ? <Link key="r" href={`/admin/revendedores/${license.reseller.id}`} className="underline">{license.reseller.user.email}</Link> : '—'],
    ['ATIVADA EM', fmtDate(license.activatedAt)],
    ['EXPIRA', license.expiresAt ? fmtDate(license.expiresAt) : license.status === 'PENDING_ACTIVATION' ? 'DEFINE NA ATIVAÇÃO' : 'VITALÍCIA'],
    ['LIMITE DE DISPOSITIVOS', String(license.deviceLimit)],
    ['ÚLTIMA VALIDAÇÃO', fmtDate(license.lastValidatedAt)],
    ['NOTAS', license.adminNotes ?? '—'],
    ['CRIADA', fmtDate(license.createdAt)],
  ]

  const canSuspend = license.status === 'ACTIVE' || license.status === 'PENDING_ACTIVATION' || license.status === 'EXPIRED'
  const canReactivate = license.status === 'SUSPENDED' || license.status === 'BLOCKED'

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/licencas" className="underline">LICENÇAS</Link> / DETALHE
        </p>
        <h1 className="type-display mt-1 flex flex-wrap items-center gap-3 text-3xl">
          LICENÇA <StatusTag tone={toneFor(estado)}>{STATE_LABELS[estado]}</StatusTag>
        </h1>
      </header>
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Chamfer cut={8} className="p-4">
            <dl className="type-mono grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
              {info.map(([k, v]) => (
                <div key={k}>
                  <dt className="type-kicker">{k}</dt>
                  <dd className="mt-0.5 break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </Chamfer>

          <section>
            <h2 className="type-kicker mb-3">INSTALAÇÃO</h2>
            {license.devices.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhuma instalação vinculada — a chave ainda não foi ativada.</p>
            ) : (
              <Table head={['DISPOSITIVO', 'HWID (MASCARADO)', 'PRIMEIRA ATIVAÇÃO', 'ÚLTIMO HEARTBEAT', 'APP', 'ESTADO']}>
                {license.devices.map((d) => (
                  <tr key={d.id}>
                    <Td>{d.name ?? '—'}</Td>
                    <Td>{maskHwid(d.hwid)}</Td>
                    <Td>{fmtDate(d.firstSeenAt)}</Td>
                    <Td>{fmtDate(d.lastSeenAt)}</Td>
                    <Td>{d.appVersion ?? '—'}</Td>
                    <Td>
                      {d.revokedAt ? <StatusTag tone="muted">REVOGADO</StatusTag> : <StatusTag tone="ok">VINCULADO</StatusTag>}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}

            <h3 className="type-kicker mt-4 mb-2">TENTATIVAS REJEITADAS (OUTRA INSTALAÇÃO)</h3>
            {rejected.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-1">[OK] Nenhuma tentativa de ativação a partir de outra instalação.</p>
            ) : (
              <Table head={['QUANDO', 'HWID (MASCARADO)', 'DISPOSITIVO', 'APP']}>
                {rejected.map((e) => {
                  const meta = (e.meta ?? {}) as { hwidMasked?: string; deviceName?: string | null; appVersion?: string | null }
                  return (
                    <tr key={e.id}>
                      <Td>{fmtDate(e.createdAt)}</Td>
                      <Td>{meta.hwidMasked ?? '—'}</Td>
                      <Td>{meta.deviceName ?? '—'}</Td>
                      <Td>{meta.appVersion ?? '—'}</Td>
                    </tr>
                  )
                })}
              </Table>
            )}
          </section>

          <section>
            <h2 className="type-kicker mb-3">EVENTOS</h2>
            <Table head={['QUANDO', 'TIPO', 'ATOR', 'DETALHES']}>
              {license.events.map((e) => (
                <tr key={e.id}>
                  <Td>{fmtDate(e.createdAt)}</Td>
                  <Td className="text-ink-1">{e.type}</Td>
                  <Td>{e.actorUserId ?? 'sistema'}</Td>
                  <Td className="max-w-[320px] whitespace-normal break-all">{e.meta ? JSON.stringify(maskJsonHwid(e.meta)) : '—'}</Td>
                </tr>
              ))}
            </Table>
          </section>
        </div>

        <aside className="space-y-4">
          {!isAdmin ? (
            <p className="type-mono text-[11px] text-ink-3">Somente leitura — ações exigem papel ADMIN.</p>
          ) : (
            <>
              {canSuspend ? (
                <Chamfer cut={6} className="p-4">
                  <h2 className="type-kicker mb-2">SUSPENDER</h2>
                  <form action={setLicenseStatusAction} className="space-y-2">
                    <input type="hidden" name="id" value={license.id} />
                    <input type="hidden" name="to" value="SUSPENDED" />
                    <ReasonInput />
                    <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                      SUSPENDER
                    </button>
                  </form>
                </Chamfer>
              ) : null}

              {canReactivate ? (
                <Chamfer cut={6} className="p-4">
                  <h2 className="type-kicker mb-2">REATIVAR</h2>
                  <form action={setLicenseStatusAction} className="space-y-2">
                    <input type="hidden" name="id" value={license.id} />
                    <input type="hidden" name="to" value="ACTIVE" />
                    <ReasonInput />
                    <button type="submit" className="btn btn--primary chamfer w-full">
                      REATIVAR
                    </button>
                  </form>
                </Chamfer>
              ) : null}

              {license.expiresAt ? (
                <Chamfer cut={6} className="p-4">
                  <h2 className="type-kicker mb-2">ESTENDER PRAZO</h2>
                  <form action={extendLicenseAction} className="space-y-2">
                    <input type="hidden" name="id" value={license.id} />
                    <input
                      name="days"
                      type="number"
                      min={1}
                      max={3650}
                      required
                      placeholder="Dias a somar"
                      aria-label="Dias a somar"
                      className="field"
                    />
                    <ReasonInput />
                    <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                      +DIAS
                    </button>
                  </form>
                </Chamfer>
              ) : null}

              <Chamfer cut={6} className="p-4">
                <h2 className="type-kicker mb-2">LIMITE DE DISPOSITIVOS</h2>
                <form action={setDeviceLimitAction} className="space-y-2">
                  <input type="hidden" name="id" value={license.id} />
                  <input
                    name="deviceLimit"
                    type="number"
                    min={1}
                    max={50}
                    required
                    defaultValue={license.deviceLimit}
                    aria-label="Novo limite de dispositivos"
                    className="field"
                  />
                  <ReasonInput />
                  <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                    TROCAR LIMITE
                  </button>
                </form>
              </Chamfer>

              {activeDevices.length > 0 ? (
                <DangerZone summary="RESET DE DISPOSITIVO">
                  <StatusTag tone="warn">EXCEÇÃO MANUAL — USO RESTRITO</StatusTag>
                  <p className="text-[13px] text-ink-2">
                    A licença é vinculada à instalação do Windows. Troca de instalação exige nova compra —
                    este reset é exceção de suporte, registrada em auditoria com ator, IP e motivo.
                  </p>
                  {activeDevices.map((d) => (
                    <form key={d.id} action={unlinkDeviceAction} className="space-y-2 border-t border-line pt-2">
                      <input type="hidden" name="deviceId" value={d.id} />
                      <p className="type-mono text-[12px] text-ink-1">
                        {d.name ?? 'SEM NOME'} · {maskHwid(d.hwid)}
                      </p>
                      <ReasonInput placeholder="Motivo do reset (obrigatório)" />
                      <button type="submit" className="btn btn--danger chamfer w-full">
                        RESETAR VÍNCULO
                      </button>
                    </form>
                  ))}
                </DangerZone>
              ) : null}

              {license.status !== 'REVOKED' ? (
                <DangerZone summary="REVOGAR LICENÇA">
                  <p className="text-[13px] text-ink-2">
                    Revogação é definitiva: o aplicativo perde acesso e a chave não volta a valer.
                  </p>
                  <form action={setLicenseStatusAction} className="space-y-2">
                    <input type="hidden" name="id" value={license.id} />
                    <input type="hidden" name="to" value="REVOKED" />
                    <ReasonInput placeholder="Motivo da revogação (obrigatório)" />
                    <button type="submit" className="btn btn--danger chamfer w-full">
                      CONFIRMAR REVOGAÇÃO
                    </button>
                  </form>
                </DangerZone>
              ) : null}

              {license.status !== 'BLOCKED' && license.status !== 'REVOKED' ? (
                <DangerZone summary="BLOQUEAR LICENÇA">
                  <p className="text-[13px] text-ink-2">
                    Bloqueio por abuso/fraude. Reversível por REATIVAR, mas o acesso cai imediatamente.
                  </p>
                  <form action={setLicenseStatusAction} className="space-y-2">
                    <input type="hidden" name="id" value={license.id} />
                    <input type="hidden" name="to" value="BLOCKED" />
                    <ReasonInput placeholder="Motivo do bloqueio (obrigatório)" />
                    <button type="submit" className="btn btn--danger chamfer w-full">
                      CONFIRMAR BLOQUEIO
                    </button>
                  </form>
                </DangerZone>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </>
  )
}
