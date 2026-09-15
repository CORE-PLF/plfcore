import { afterEach, describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { claimJob, recoverAbandonedJobs, workerId } from '@/lib/jobs'

const created: string[] = []

// jobs de teste ficam com runAt no futuro para o worker de dev nunca pegá-los
async function makeJob(data: {
  status: 'PENDING' | 'RUNNING'
  attempts?: number
  maxAttempts?: number
  leaseUntil?: Date
}) {
  const job = await db.job.create({
    data: {
      type: 'email.send',
      payload: {},
      status: data.status,
      attempts: data.attempts ?? 0,
      maxAttempts: data.maxAttempts ?? 5,
      runAt: new Date(Date.now() + 3600_000),
      ...(data.status === 'RUNNING'
        ? { lockedAt: new Date(), lockedBy: 'test#0', leaseUntil: data.leaseUntil }
        : {}),
    },
  })
  created.push(job.id)
  return job
}

afterEach(async () => {
  await db.job.deleteMany({ where: { id: { in: created.splice(0) } } })
})

describe('recoverAbandonedJobs', () => {
  test('RUNNING com lease vencida volta para PENDING com attempts+1 e locks nulos', async () => {
    const job = await makeJob({ status: 'RUNNING', attempts: 1, leaseUntil: new Date(Date.now() - 60_000) })

    const recovered = await recoverAbandonedJobs()
    expect(recovered).toBeGreaterThanOrEqual(1)

    const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(fresh.status).toBe('PENDING')
    expect(fresh.attempts).toBe(2)
    expect(fresh.lockedAt).toBeNull()
    expect(fresh.lockedBy).toBeNull()
    expect(fresh.leaseUntil).toBeNull()
  })

  test('na última tentativa vira DEAD com lastError de lease expirada', async () => {
    const job = await makeJob({
      status: 'RUNNING',
      attempts: 4,
      maxAttempts: 5,
      leaseUntil: new Date(Date.now() - 60_000),
    })

    await recoverAbandonedJobs()

    const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(fresh.status).toBe('DEAD')
    expect(fresh.attempts).toBe(5)
    expect(fresh.lastError).toMatch(/lease expirada/)
    expect(fresh.lockedBy).toBeNull()
  })

  test('RUNNING com lease no futuro não é tocado', async () => {
    const job = await makeJob({ status: 'RUNNING', leaseUntil: new Date(Date.now() + 60_000) })

    await recoverAbandonedJobs()

    const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(fresh.status).toBe('RUNNING')
    expect(fresh.attempts).toBe(0)
  })
})

describe('claimJob', () => {
  test('só vence uma vez para o mesmo job', async () => {
    const job = await makeJob({ status: 'PENDING' })

    expect(await claimJob(job.id, workerId())).toBe(true)
    expect(await claimJob(job.id, workerId())).toBe(false)

    const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id } })
    expect(fresh.status).toBe('RUNNING')
    expect(fresh.lockedBy).toBe(workerId())
    expect(fresh.lockedAt).not.toBeNull()
    expect(fresh.leaseUntil?.getTime()).toBeGreaterThan(Date.now())
  })
})
