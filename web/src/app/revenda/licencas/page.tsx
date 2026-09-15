import type { Metadata } from 'next'
import Link from 'next/link'
import type { LicenseStatus } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { getSetting } from '@/lib/settings'
import { Kicker, RuleFade, StatusTag } from '@/components/ui'
import { fmtDate, fmtDateTime, requireApprovedReseller } from '../guards'
import { LicenseActions } from './license-actions'

export const metadata: Metadata = { title: 'Licenças emitidas' }

const STATUS_LABEL: Record<LicenseStatus, { label: string; tone: 'ok' | 'danger' | 'warn' | 'muted' }> = {
  PENDING_ACTIVATION: { label: 'AGUARDANDO ATIVAÇÃO', tone: 'muted' },
  ACTIVE: { label: 'ATIVA', tone: 'ok' },
  EXPIRED: { label: 'EXPIRADA', tone: 'muted' },
  SUSPENDED: { label: 'SUSPENSA', tone: 'warn' },
  REVOKED: { label: 'REVOGADA', tone: 'danger' },
  BLOCKED: { label: 'BLOQUEADA', tone: 'danger' },
  REPLACED: { label: 'SUBSTITUÍDA', tone: 'muted' },
}

const REVOCABLE: LicenseStatus[] = ['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED']

function validade(status: LicenseStatus, expiresAt: Date | null): string {
  if (expiresAt) return fmtDate(expiresAt)
  if (status === 'PENDING_ACTIVATION') return 'Inicia na ativação'
  return 'Vitalícia'
}

export default async function LicencasPage() {
  const { reseller } = await requireApprovedReseller()

  const [licenses, canRevoke] = await Promise.all([
    db.license.findMany({
      where: { resellerId: reseller.id },
      include: { plan: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    getSetting('reseller_can_revoke', true),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Kicker>LICENÇAS</Kicker>
        <h1 className="type-display mt-1 text-4xl">LICENÇAS EMITIDAS</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-3)' }}>
          Toda revelação de chave fica registrada na auditoria.
        </p>
      </div>

      <RuleFade />

      {licenses.length === 0 ? (
        <div>
          <p style={{ color: 'var(--color-ink-2)' }}>Você ainda não emitiu nenhuma licença.</p>
          <Link href="/revenda/emitir" className="btn btn--primary chamfer mt-4 inline-flex">
            EMITIR LICENÇA
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                <th className="type-kicker py-2 pr-4 font-bold">CHAVE</th>
                <th className="type-kicker py-2 pr-4 font-bold">PLANO</th>
                <th className="type-kicker py-2 pr-4 font-bold">CLIENTE</th>
                <th className="type-kicker py-2 pr-4 font-bold">STATUS</th>
                <th className="type-kicker py-2 pr-4 font-bold">EMITIDA</th>
                <th className="type-kicker py-2 pr-4 font-bold">VALIDADE</th>
              </tr>
            </thead>
            <tbody>
              {licenses.map((lic) => {
                const st = STATUS_LABEL[lic.status]
                return (
                  <tr key={lic.id} className="border-b align-top" style={{ borderColor: 'var(--color-line)' }}>
                    <td className="py-3 pr-4">
                      <LicenseActions
                        licenseId={lic.id}
                        keyMasked={lic.keyMasked}
                        canRevoke={canRevoke && REVOCABLE.includes(lic.status)}
                      />
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4" style={{ color: 'var(--color-ink-2)' }}>
                      {lic.plan.name}
                    </td>
                    <td className="max-w-48 truncate py-3 pr-4" style={{ color: 'var(--color-ink-2)' }}>
                      {lic.adminNotes?.replace(/^Revenda — /, '') ?? '—'}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4">
                      <StatusTag tone={st.tone}>{st.label}</StatusTag>
                    </td>
                    <td className="type-mono whitespace-nowrap py-3 pr-4" style={{ color: 'var(--color-ink-3)' }}>
                      {fmtDateTime(lic.createdAt)}
                    </td>
                    <td className="type-mono whitespace-nowrap py-3 pr-4" style={{ color: 'var(--color-ink-3)' }}>
                      {validade(lic.status, lic.expiresAt)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
