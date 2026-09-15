import { redirect } from 'next/navigation'
import type { Reseller, User } from '@/generated/prisma/client'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function resellerForUser(): Promise<{ user: User; reseller: Reseller | null }> {
  const user = await requireUser()
  const reseller = await db.reseller.findUnique({ where: { userId: user.id } })
  return { user, reseller }
}

// Subpáginas do painel de revenda exigem conta aprovada; /revenda trata os
// demais estados (sem inscrição, pendente, suspensa).
export async function requireApprovedReseller(): Promise<{ user: User; reseller: Reseller }> {
  const { user, reseller } = await resellerForUser()
  if (!reseller || reseller.status !== 'APPROVED') redirect('/revenda')
  return { user, reseller }
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function fmtDate(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' })
}
