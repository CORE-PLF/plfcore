import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { retryJobAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { Flash, PageTitle, Table, Td, fmtDate, toneFor, type SP } from '../../_ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fila (jobs)' }

// Saúde da fila: contagens por estado + jobs DEAD com reenfileirar.
// Fila crescendo ou DEAD acumulando = worker parado ou integração quebrada.
export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams

  const [counts, dead, stuck, lastDone] = await Promise.all([
    db.job.groupBy({ by: ['status'], _count: { _all: true } }),
    db.job.findMany({ where: { status: 'DEAD' }, orderBy: { updatedAt: 'desc' }, take: 50 }),
    db.job.findMany({ where: { status: 'RUNNING' }, orderBy: { lockedAt: 'asc' }, take: 20 }),
    db.job.findFirst({ where: { status: 'DONE' }, orderBy: { updatedAt: 'desc' } }),
  ])
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0

  return (
    <>
      <PageTitle kicker="OPERAÇÃO" title="FILA (JOBS)" />
      <Flash sp={sp} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(['PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD'] as const).map((s) => (
          <Chamfer key={s} cut={6} flat className="p-3">
            <p className="type-kicker">{s}</p>
            <p className="type-mono mt-1 text-2xl text-ink-1">{countOf(s)}</p>
          </Chamfer>
        ))}
      </div>
      <p className="type-mono mb-6 text-[11px] text-ink-3">
        ÚLTIMO JOB CONCLUÍDO: {lastDone ? `${lastDone.type} — ${fmtDate(lastDone.updatedAt)}` : 'NENHUM'}
        {' · '}worker parado = PENDING cresce e nada conclui.
      </p>

      <h2 className="type-kicker mb-2">EM EXECUÇÃO (LEASE)</h2>
      {stuck.length === 0 ? (
        <p className="type-mono mb-6 text-[12px] text-ink-3">Nenhum job em execução agora.</p>
      ) : (
        <div className="mb-6">
          <Table head={['TIPO', 'WORKER', 'INICIADO', 'LEASE ATÉ', 'TENTATIVA']}>
            {stuck.map((j) => (
              <tr key={j.id}>
                <Td>{j.type}</Td>
                <Td>{j.lockedBy ?? '—'}</Td>
                <Td>{fmtDate(j.lockedAt)}</Td>
                <Td>{fmtDate(j.leaseUntil)}</Td>
                <Td>
                  {j.attempts + 1}/{j.maxAttempts}
                </Td>
              </tr>
            ))}
          </Table>
          <p className="type-mono mt-2 text-[11px] text-ink-3">
            Lease vencida é retomada automaticamente pelo worker no próximo ciclo.
          </p>
        </div>
      )}

      <h2 className="type-kicker mb-2">DEAD — ESGOTARAM AS TENTATIVAS</h2>
      {dead.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhum job DEAD. Bom sinal.</p>
      ) : (
        <Table head={['TIPO', 'TENTATIVAS', 'ÚLTIMO ERRO', 'ATUALIZADO', '']}>
          {dead.map((j) => (
            <tr key={j.id}>
              <Td>
                <StatusTag tone={toneFor('DEAD')}>DEAD</StatusTag> {j.type}
              </Td>
              <Td>
                {j.attempts}/{j.maxAttempts}
              </Td>
              <Td className="max-w-[360px] whitespace-normal">
                <span className="text-signal">{j.lastError?.slice(0, 300) ?? '—'}</span>
              </Td>
              <Td>{fmtDate(j.updatedAt)}</Td>
              <Td>
                <form action={retryJobAction}>
                  <input type="hidden" name="id" value={j.id} />
                  <button type="submit" className="btn btn--ghost btn--sm chamfer">
                    REENFILEIRAR
                  </button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
