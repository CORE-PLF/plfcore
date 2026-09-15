import { hostname } from 'node:os'
import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'

type Tx = Prisma.TransactionClient

export type JobType =
  | 'discord.dm_purchase'
  | 'discord.dm_expiry_warning'
  | 'discord.role_sync'
  | 'email.send'
  | 'reseller.webhook'
  | 'licenses.expire_sweep'
  | 'commissions.approve_sweep'
  | 'system.cleanup_sweep'

// Enfileirar DENTRO da transação do evento garante que pagamento confirmado
// nunca perde a notificação — o worker entrega com retry + backoff.
export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; maxAttempts?: number } = {},
  tx: Tx = db,
): Promise<void> {
  await tx.job.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
    },
  })
}

// ===== lease: com N workers, cada job roda uma vez; worker morto não prende job =====

const LEASE_MS = 5 * 60_000
const CLEAR_LOCKS = { lockedAt: null, lockedBy: null, leaseUntil: null }

export function workerId(): string {
  return `${hostname()}#${process.pid}`
}

export async function claimJob(jobId: string, workerId: string): Promise<boolean> {
  const now = new Date()
  const res = await db.job.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: {
      status: 'RUNNING',
      lockedAt: now,
      lockedBy: workerId,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
    },
  })
  return res.count === 1
}

export async function completeJob(jobId: string): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: { status: 'DONE', lastError: null, ...CLEAR_LOCKS },
  })
}

export async function failJob(
  job: { id: string; attempts: number; maxAttempts: number },
  lastError: string,
): Promise<{ status: 'PENDING' | 'DEAD'; attempts: number; runAt?: Date }> {
  const attempts = job.attempts + 1
  if (attempts < job.maxAttempts) {
    const runAt = new Date(Date.now() + 2 ** attempts * 60_000) // backoff exponencial em minutos
    await db.job.update({
      where: { id: job.id },
      data: { status: 'PENDING', attempts, lastError, runAt, ...CLEAR_LOCKS },
    })
    return { status: 'PENDING', attempts, runAt }
  }
  await db.job.update({
    where: { id: job.id },
    data: { status: 'DEAD', attempts, lastError, ...CLEAR_LOCKS },
  })
  return { status: 'DEAD', attempts }
}

// RUNNING com lease vencida = worker morreu no meio. Retomada atômica:
// condicionada ao MESMO leaseUntil, para não atropelar re-claim concorrente.
export async function recoverAbandonedJobs(): Promise<number> {
  const abandoned = await db.job.findMany({
    where: { status: 'RUNNING', leaseUntil: { lt: new Date() } },
    take: 50,
  })
  let recovered = 0
  for (const job of abandoned) {
    const attempts = job.attempts + 1
    const data =
      attempts >= job.maxAttempts
        ? {
            status: 'DEAD' as const,
            attempts,
            lastError: 'lease expirada — worker interrompido durante a execução',
            ...CLEAR_LOCKS,
          }
        : { status: 'PENDING' as const, attempts, ...CLEAR_LOCKS }
    const res = await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING', leaseUntil: job.leaseUntil },
      data,
    })
    if (res.count === 1) recovered++
  }
  return recovered
}
