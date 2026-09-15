import type { Prisma } from '@/generated/prisma/client'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { Flash, PER_PAGE, PageTitle, Pager, Table, Td, fmtDate, maskJsonHwid, pageOf, spStr, type SP } from '../../_ui'

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams
  const action = spStr(sp, 'acao')
  const entity = spStr(sp, 'entidade')
  const actor = spStr(sp, 'ator')
  const from = spStr(sp, 'de')
  const to = spStr(sp, 'ate')
  const page = pageOf(sp)

  const where: Prisma.AuditLogWhereInput = {}
  if (action) where.action = { contains: action }
  if (entity) where.entity = entity
  if (from || to)
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    }

  // ator aceita id exato ou e-mail
  if (actor) {
    const byEmail = actor.includes('@') ? await db.user.findUnique({ where: { email: actor.toLowerCase() } }) : null
    where.actorUserId = byEmail ? byEmail.id : actor
  }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PER_PAGE + 1,
    skip: (page - 1) * PER_PAGE,
  })
  const hasMore = logs.length > PER_PAGE
  const rows = logs.slice(0, PER_PAGE)

  const actorIds = [...new Set(rows.map((l) => l.actorUserId).filter((v): v is string => Boolean(v)))]
  const actors = new Map(
    (await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })).map((u) => [
      u.id,
      u.email,
    ]),
  )
  const entities = await db.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, take: 50 })

  return (
    <>
      <PageTitle kicker="AUDITORIA" title="REGISTRO DE AÇÕES" />
      <Flash sp={sp} />

      <form action="/admin/auditoria" method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input name="acao" defaultValue={action} placeholder="Ação (ex.: admin.order_refund)" aria-label="Ação" className="field max-w-[240px]" />
        <select name="entidade" defaultValue={entity} className="field max-w-[180px]" aria-label="Entidade">
          <option value="">TODAS AS ENTIDADES</option>
          {entities.map((e) => (
            <option key={e.entity} value={e.entity}>
              {e.entity}
            </option>
          ))}
        </select>
        <input name="ator" defaultValue={actor} placeholder="Ator (id ou e-mail)" aria-label="Ator" className="field max-w-[200px]" />
        <input name="de" type="date" defaultValue={from} aria-label="De" className="field type-mono max-w-[160px]" />
        <input name="ate" type="date" defaultValue={to} aria-label="Até" className="field type-mono max-w-[160px]" />
        <button type="submit" className="btn btn--ghost btn--sm chamfer">
          FILTRAR
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum registro para os filtros.</p>
      ) : (
        <Table head={['QUANDO', 'ATOR', 'AÇÃO', 'ENTIDADE', 'MOTIVO', 'DIFF']}>
          {rows.map((l) => (
            <tr key={l.id}>
              <Td>{fmtDate(l.createdAt)}</Td>
              <Td>{l.actorUserId ? (actors.get(l.actorUserId) ?? l.actorUserId) : 'sistema'}</Td>
              <Td className="text-ink-1">{l.action}</Td>
              <Td>
                {l.entity}
                {l.entityId ? <span className="text-ink-3"> {l.entityId.slice(0, 12)}</span> : null}
              </Td>
              <Td className="max-w-[220px] whitespace-normal">{l.reason ?? '—'}</Td>
              <Td>
                {l.before !== null || l.after !== null ? (
                  <details>
                    <summary className="cursor-pointer text-ink-3">VER</summary>
                    <div className="mt-2 max-w-lg space-y-2 whitespace-pre-wrap break-all">
                      {l.before !== null ? (
                        <div>
                          <p className="type-kicker">ANTES</p>
                          <pre className="type-mono overflow-x-auto bg-steel p-2 text-[11px]">
                            {JSON.stringify(maskJsonHwid(l.before), null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {l.after !== null ? (
                        <div>
                          <p className="type-kicker">DEPOIS</p>
                          <pre className="type-mono overflow-x-auto bg-steel p-2 text-[11px]">
                            {JSON.stringify(maskJsonHwid(l.after), null, 2)}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : (
                  '—'
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager path="/admin/auditoria" sp={sp} page={page} hasMore={hasMore} />
    </>
  )
}
