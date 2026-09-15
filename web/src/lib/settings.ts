import type { Prisma } from '@/generated/prisma/client'
import { db } from './db'

type Tx = Prisma.TransactionClient

// Configuração administrável sem deploy (janela de reembolso, IDs do Discord,
// cargos, conteúdo comercial). Segredos NUNCA moram aqui — só no ambiente.

export async function getSetting<T>(key: string, fallback: T, tx: Tx = db): Promise<T> {
  const row = await tx.setting.findUnique({ where: { key } })
  return row ? (row.value as T) : fallback
}

export async function getSettingNumber(key: string, fallback: number, tx: Tx = db): Promise<number> {
  const v = await getSetting<unknown>(key, fallback, tx)
  return typeof v === 'number' ? v : fallback
}

export async function setSetting(key: string, value: unknown, tx: Tx = db): Promise<void> {
  await tx.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  })
}
