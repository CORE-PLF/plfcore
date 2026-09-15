import Link from 'next/link'
import type { Prisma } from '@/generated/prisma/client'
import { hasStaffRole, requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { licenseDisplayState, maskHwid } from '@/lib/licensing'
import { Chamfer, StatusTag } from '@/components/ui'
import { Flash, PER_PAGE, PageTitle, Pager, STATE_LABELS, SearchForm, Table, Td, fmtDate, pageOf, spStr, toneFor, type SP } from '../../_ui'
import { GrantLicenseForm } from './grant-form'

const REJECTED = 'ACTIVATION_REJECTED_NEW_INSTALL'

const ESTADOS = [
  ['SEM_ATIVACAO', 'SEM ATIVAÇÃO'],
  ['ATIVA', 'ATIVA'],
  ['CONSUMIDA', 'CONSUMIDA (OUTRA INSTALAÇÃO)'],
  ['EXPIRADA', 'EXPIRADA'],
  ['SUSPENSA', 'SUSPENSA'],
  ['REVOGADA', 'REVOGADA'],
  ['BLOQUEADA', 'BLOQUEADA'],
  ['SUBSTITUIDA', 'SUBSTITUÍDA'],
] as const

export default async function AdminLicensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff('SUPPORT')
  const sp = await searchParams
  const q = spStr(sp, 'q').trim()
  const estado = spStr(sp, 'estado')
  const page = pageOf(sp)
  const now = new Date()

  // Filtro pelo estado DERIVADO (o que o cliente vê), não pelo status cru do banco.
  const ESTADO_FILTERS: Record<string, Prisma.LicenseWhereInput> = {
    SEM_ATIVACAO: { status: 'PENDING_ACTIVATION' },
    ATIVA: {
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      events: { none: { type: REJECTED } },
    },
    CONSUMIDA: { events: { some: { type: REJECTED } } },
    EXPIRADA: { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiresAt: { lt: now } }] },
    SUSPENSA: { status: 'SUSPENDED' },
    REVOGADA: { status: 'REVOKED' },
    BLOQUEADA: { status: 'BLOCKED' },
    SUBSTITUIDA: { status: 'REPLACED' },
  }

  const filters: Prisma.LicenseWhereInput[] = []
  if (ESTADO_FILTERS[estado]) filters.push(ESTADO_FILTERS[estado])
  if (q) {
    const or: Prisma.LicenseWhereInput[] = [
      { id: q },
      { user: { email: { contains: q } } },
      { keyMasked: { contains: q.toUpperCase() } },
    ]
    // >=8 hex chars = prefixo de HWID-hash (busca no vínculo de instalação)
    if (/^[0-9a-fA-F]{8,}$/.test(q)) or.push({ devices: { some: { hwid: { startsWith: q.toLowerCase() } } } })
    filters.push({ OR: or })
  }

  const licenses = await db.license.findMany({
    where: { AND: filters },
    include: {
      user: { select: { email: true } },
      plan: { select: { name: true } },
      devices: { where: { revokedAt: null }, orderBy: { firstSeenAt: 'asc' }, take: 1 },
      _count: { select: { events: { where: { type: REJECTED } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = licenses.length > PER_PAGE
  const rows = licenses.slice(0, PER_PAGE)
  const isAdmin = hasStaffRole(staff, 'ADMIN')
  const plans = isAdmin
    ? await db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
    : []

  return (
    <>
      <PageTitle kicker="LICENÇAS" title="CHAVES E ATIVAÇÕES" />
      <Flash sp={sp} />

      {isAdmin ? (
        <Chamfer cut={8} className="mb-6 p-4">
          <h2 className="type-kicker mb-3">CONCEDER LICENÇA MANUAL</h2>
          <GrantLicenseForm plans={plans} />
        </Chamfer>
      ) : null}

      <SearchForm path="/admin/licencas" sp={sp} placeholder="E-mail, chave ou prefixo do HWID (8+ hex)">
        <select name="estado" defaultValue={estado} className="field max-w-[260px]" aria-label="Filtrar por estado">
          <option value="">TODOS OS ESTADOS</option>
          {ESTADOS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </SearchForm>

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhuma licença encontrada.</p>
      ) : (
        <Table head={['USUÁRIO', 'PLANO', 'CHAVE', 'ESTADO', 'DISPOSITIVO', 'VALIDADE']}>
          {rows.map((l) => {
            const st = licenseDisplayState(l, l._count.events > 0)
            const device = l.devices[0]
            return (
              <tr key={l.id}>
                <Td>{l.user.email}</Td>
                <Td>{l.plan.name}</Td>
                <Td>
                  <Link href={`/admin/licencas/${l.id}`} className="text-ink-1 underline">
                    {l.keyMasked}
                  </Link>
                </Td>
                <Td>
                  <StatusTag tone={toneFor(st)}>{STATE_LABELS[st]}</StatusTag>
                </Td>
                <Td>{device ? `${device.name ?? 'SEM NOME'} · ${maskHwid(device.hwid)}` : '—'}</Td>
                <Td>{l.expiresAt ? fmtDate(l.expiresAt) : l.status === 'PENDING_ACTIVATION' ? 'DEFINE NA ATIVAÇÃO' : 'VITALÍCIA'}</Td>
              </tr>
            )
          })}
        </Table>
      )}
      <Pager path="/admin/licencas" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
