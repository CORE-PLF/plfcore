// Worker de fila — processo separado do Next: `npm run worker` (tsx).
// Claim com lease em @/lib/jobs: com N workers, cada job roda uma vez;
// worker morto tem os jobs retomados via recoverAbandonedJobs.
import 'dotenv/config'
import { db } from '@/lib/db'
import {
  claimJob,
  completeJob,
  enqueue,
  failJob,
  recoverAbandonedJobs,
  workerId,
  type JobType,
} from '@/lib/jobs'
import { handlers } from './handlers'

const TICK_MS = 5_000
const SCHEDULE_MS = 10 * 60_000
const BATCH = 10
const WORKER_ID = workerId()

let stopping = false

function log(fields: Record<string, unknown>): void {
  // nunca logar payload: pode conter token de e-mail; licença nunca circula por job
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }))
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 2000) : String(err)
}

async function runJob(job: { id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }): Promise<void> {
  if (!(await claimJob(job.id, WORKER_ID))) return // outro worker levou

  const t0 = Date.now()
  try {
    const handler = handlers[job.type as JobType]
    if (!handler) throw new Error(`tipo de job desconhecido: ${job.type}`)
    await handler((job.payload ?? {}) as Record<string, unknown>)
    await completeJob(job.id)
    log({ evt: 'job.done', jobId: job.id, type: job.type, attempt: job.attempts + 1, ms: Date.now() - t0 })
  } catch (err) {
    const lastError = errMsg(err)
    const result = await failJob(job, lastError)
    if (result.status === 'PENDING') {
      log({ evt: 'job.retry', jobId: job.id, type: job.type, attempt: result.attempts, nextRunAt: result.runAt?.toISOString(), ms: Date.now() - t0, error: lastError.slice(0, 300) })
    } else {
      log({ evt: 'job.dead', jobId: job.id, type: job.type, attempts: result.attempts, ms: Date.now() - t0, error: lastError.slice(0, 300) })
    }
  }
}

async function tick(): Promise<void> {
  const recovered = await recoverAbandonedJobs()
  if (recovered > 0) log({ evt: 'job.recovered', count: recovered, workerId: WORKER_ID })

  const jobs = await db.job.findMany({
    where: { status: 'PENDING', runAt: { lte: new Date() } },
    orderBy: { runAt: 'asc' },
    take: BATCH,
  })
  for (const job of jobs) {
    if (stopping) break
    await runJob(job)
  }
}

// Enfileira os sweeps periódicos sem duplicar: só se não houver PENDING do tipo.
async function scheduleSweeps(): Promise<void> {
  const sweeps: JobType[] = ['licenses.expire_sweep', 'commissions.approve_sweep', 'system.cleanup_sweep']
  for (const type of sweeps) {
    const pending = await db.job.count({ where: { type, status: 'PENDING' } })
    if (pending === 0) await enqueue(type, {})
  }
}

async function sleepInterruptible(ms: number): Promise<void> {
  const slice = 500
  for (let waited = 0; waited < ms && !stopping; waited += slice) {
    await new Promise((r) => setTimeout(r, slice))
  }
}

async function main(): Promise<void> {
  log({ evt: 'worker.start', pid: process.pid, workerId: WORKER_ID })
  let lastSchedule = 0
  while (!stopping) {
    if (Date.now() - lastSchedule >= SCHEDULE_MS) {
      lastSchedule = Date.now()
      await scheduleSweeps().catch((err) => log({ evt: 'worker.schedule_error', error: errMsg(err) }))
    }
    await tick().catch((err) => log({ evt: 'worker.tick_error', error: errMsg(err) }))
    await sleepInterruptible(TICK_MS)
  }
  await db.$disconnect()
  log({ evt: 'worker.stop', pid: process.pid })
}

// Encerramento gracioso: para o loop; o job em execução termina antes de sair.
function shutdown(signal: string): void {
  log({ evt: 'worker.shutdown_signal', signal })
  stopping = true
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

main().catch((err) => {
  log({ evt: 'worker.fatal', error: errMsg(err) })
  process.exit(1)
})
