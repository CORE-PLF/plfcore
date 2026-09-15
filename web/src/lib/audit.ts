import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'

type Tx = Prisma.TransactionClient

interface AuditInput {
  actorUserId?: string | null
  action: string
  entity: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  reason?: string | null
  ip?: string | null
}

// Passar tx quando a auditoria precisa ser atômica com a operação (financeiro, licença).
export async function audit(input: AuditInput, tx: Tx = db): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
      after: input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    },
  })
}
