import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hasStaffRole, requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { forceLogoutAction, setStaffRoleAction, setUserStatusAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { DangerZone, Flash, ReasonInput, Table, Td, fmtDate, toneFor, type SP } from '../../../_ui'
import { AdminRecoveryForm } from './recovery-form'

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  const staff = await requireStaff('SUPPORT')
  const { id } = await params
  const sp = await searchParams

  const user = await db.user.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { createdAt: 'desc' }, take: 10 },
      orders: { orderBy: { createdAt: 'desc' }, take: 10, include: { plan: { select: { name: true } } } },
      licenses: { orderBy: { createdAt: 'desc' }, include: { plan: { select: { name: true } } } },
      affiliate: { select: { id: true, code: true, status: true } },
      reseller: { select: { id: true, status: true } },
      securityQuestions: { select: { slot: true, question: true } },
    },
  })
  if (!user) notFound()
  const isAdmin = hasStaffRole(staff, 'ADMIN')
  const isSuper = hasStaffRole(staff, 'SUPERADMIN')
  const isSelf = user.id === staff.id

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/usuarios" className="underline">USUÁRIOS</Link> / DETALHE
        </p>
        <h1 className="type-display mt-1 flex flex-wrap items-center gap-3 text-3xl">
          {user.name} <StatusTag tone={toneFor(user.status)}>{user.status}</StatusTag>
          {user.staffRole !== 'NONE' ? <StatusTag tone="warn">{user.staffRole}</StatusTag> : null}
        </h1>
      </header>
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Chamfer cut={8} className="p-4">
            <dl className="type-mono grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="type-kicker">E-MAIL</dt>
                <dd className="mt-0.5 break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="type-kicker">E-MAIL VERIFICADO</dt>
                <dd className="mt-0.5">{user.emailVerifiedAt ? fmtDate(user.emailVerifiedAt) : 'NÃO'}</dd>
              </div>
              <div>
                <dt className="type-kicker">DISCORD</dt>
                <dd className="mt-0.5">{user.discordUsername ?? '—'}</dd>
              </div>
              <div>
                <dt className="type-kicker">PAÍS / IDIOMA</dt>
                <dd className="mt-0.5">{user.country ?? '—'} / {user.locale}</dd>
              </div>
              <div>
                <dt className="type-kicker">2FA</dt>
                <dd className="mt-0.5">{user.totpSecret ? 'ATIVA' : 'INATIVA'}</dd>
              </div>
              <div>
                <dt className="type-kicker">PERGUNTAS DE SEGURANÇA</dt>
                <dd className="mt-0.5">
                  {user.securityQuestions.length === 2 ? 'CONFIGURADAS' : 'NÃO CONFIGURADAS'}
                </dd>
              </div>
              <div>
                <dt className="type-kicker">CRIADO</dt>
                <dd className="mt-0.5">{fmtDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt className="type-kicker">AFILIADO</dt>
                <dd className="mt-0.5">
                  {user.affiliate ? (
                    <Link href={`/admin/afiliados/${user.affiliate.id}`} className="underline">
                      {user.affiliate.code} ({user.affiliate.status})
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="type-kicker">REVENDEDOR</dt>
                <dd className="mt-0.5">
                  {user.reseller ? (
                    <Link href={`/admin/revendedores/${user.reseller.id}`} className="underline">
                      {user.reseller.status}
                    </Link>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </Chamfer>

          <section>
            <h2 className="type-kicker mb-3">PEDIDOS (ÚLTIMOS 10)</h2>
            {user.orders.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhum pedido.</p>
            ) : (
              <Table head={['PEDIDO', 'PLANO', 'TOTAL', 'STATUS', 'CRIADO']}>
                {user.orders.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      <Link href={`/admin/pedidos/${o.id}`} className="text-ink-1 underline">
                        {o.id.slice(0, 10)}…
                      </Link>
                    </Td>
                    <Td>{o.plan.name}</Td>
                    <Td>{formatCents(o.totalCents, o.currency)}</Td>
                    <Td>
                      <StatusTag tone={toneFor(o.status)}>{o.status}</StatusTag>
                    </Td>
                    <Td>{fmtDate(o.createdAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <section>
            <h2 className="type-kicker mb-3">LICENÇAS</h2>
            {user.licenses.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhuma licença.</p>
            ) : (
              <Table head={['CHAVE', 'PLANO', 'STATUS', 'EXPIRA']}>
                {user.licenses.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <Link href={`/admin/licencas/${l.id}`} className="text-ink-1 underline">
                        {l.keyMasked}
                      </Link>
                    </Td>
                    <Td>{l.plan.name}</Td>
                    <Td>
                      <StatusTag tone={toneFor(l.status)}>{l.status}</StatusTag>
                    </Td>
                    <Td>{l.expiresAt ? fmtDate(l.expiresAt) : '—'}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          <section>
            <h2 className="type-kicker mb-3">SESSÕES (ÚLTIMAS 10)</h2>
            {user.sessions.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhuma sessão registrada.</p>
            ) : (
              <Table head={['CRIADA', 'IP', 'AGENTE', 'EXPIRA', 'REVOGADA']}>
                {user.sessions.map((s) => (
                  <tr key={s.id}>
                    <Td>{fmtDate(s.createdAt)}</Td>
                    <Td>{s.ip ?? '—'}</Td>
                    <Td className="max-w-[240px] truncate">{s.userAgent ?? '—'}</Td>
                    <Td>{fmtDate(s.expiresAt)}</Td>
                    <Td>{s.revokedAt ? fmtDate(s.revokedAt) : '—'}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {!isAdmin ? (
            <p className="type-mono text-[11px] text-ink-3">Somente leitura — ações exigem papel ADMIN.</p>
          ) : (
            <>
              <Chamfer cut={6} className="p-4">
                <h2 className="type-kicker mb-2">FORÇAR LOGOUT GERAL</h2>
                <p className="mb-2 text-[13px] text-ink-2">Encerra todas as sessões ativas do usuário.</p>
                <form action={forceLogoutAction}>
                  <input type="hidden" name="id" value={user.id} />
                  <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                    ENCERRAR SESSÕES
                  </button>
                </form>
              </Chamfer>

              {!isSelf && user.status === 'ACTIVE' ? (
                <DangerZone summary="SUSPENDER CONTA">
                  <p className="text-[13px] text-ink-2">
                    A conta perde acesso ao site e as sessões são encerradas. Licenças não são alteradas.
                  </p>
                  <form action={setUserStatusAction} className="space-y-2">
                    <input type="hidden" name="id" value={user.id} />
                    <input type="hidden" name="to" value="SUSPENDED" />
                    <ReasonInput placeholder="Motivo da suspensão (obrigatório)" />
                    <button type="submit" className="btn btn--danger chamfer w-full">
                      CONFIRMAR SUSPENSÃO
                    </button>
                  </form>
                </DangerZone>
              ) : null}

              {!isSelf && user.status === 'SUSPENDED' ? (
                <Chamfer cut={6} className="p-4">
                  <h2 className="type-kicker mb-2">REATIVAR CONTA</h2>
                  <form action={setUserStatusAction} className="space-y-2">
                    <input type="hidden" name="id" value={user.id} />
                    <input type="hidden" name="to" value="ACTIVE" />
                    <ReasonInput />
                    <button type="submit" className="btn btn--primary chamfer w-full">
                      REATIVAR
                    </button>
                  </form>
                </Chamfer>
              ) : null}

              {!isSelf && (user.staffRole === 'NONE' || isSuper) ? (
                <DangerZone summary="RECUPERAR CONTA (SUPORTE)">
                  <AdminRecoveryForm userId={user.id} />
                </DangerZone>
              ) : null}

              {isSuper && !isSelf ? (
                <Chamfer cut={6} className="p-4">
                  <h2 className="type-kicker mb-2">PAPEL DE STAFF</h2>
                  <form action={setStaffRoleAction} className="space-y-2">
                    <input type="hidden" name="id" value={user.id} />
                    <select name="role" defaultValue={user.staffRole} className="field" aria-label="Papel de staff">
                      <option value="NONE">NONE</option>
                      <option value="SUPPORT">SUPPORT</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPERADMIN">SUPERADMIN</option>
                    </select>
                    <ReasonInput placeholder="Motivo da mudança de papel (obrigatório)" />
                    <button type="submit" className="btn btn--ghost btn--sm chamfer w-full">
                      ALTERAR PAPEL
                    </button>
                  </form>
                </Chamfer>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </>
  )
}
