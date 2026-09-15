import { db } from './db'
import { sha256 } from './crypto'

export const AFFILIATE_COOKIE = 'bbx_ref'

// Registro de clique: /a/[codigo] → cookie de 30 dias + linha de clique.
export async function registerClick(code: string, meta: { ip?: string; userAgent?: string; landingPage?: string }) {
  const affiliate = await db.affiliate.findUnique({ where: { code } })
  if (!affiliate || affiliate.status !== 'APPROVED') return null
  const click = await db.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      ipHash: meta.ip ? sha256(meta.ip) : null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      landingPage: meta.landingPage?.slice(0, 255) ?? null,
    },
  })
  return { affiliate, click }
}

// Last-click: cookie sempre sobrescreve a atribuição viva do usuário.
// Autoindicação é bloqueada aqui e revalidada na comissão.
export async function attachAttribution(userId: string, code: string): Promise<void> {
  const affiliate = await db.affiliate.findUnique({ where: { code } })
  if (!affiliate || affiliate.status !== 'APPROVED' || affiliate.userId === userId) return
  const expiresAt = new Date(Date.now() + affiliate.windowDays * 86400_000)
  await db.affiliateAttribution.upsert({
    where: { userId },
    create: { affiliateId: affiliate.id, userId, expiresAt },
    update: { affiliateId: affiliate.id, expiresAt, createdAt: new Date() },
  })
}

// Resolve na criação do pedido: atribuição viva (não expirada) do usuário.
export async function resolveAffiliateForOrder(userId: string): Promise<string | null> {
  const attr = await db.affiliateAttribution.findUnique({ where: { userId } })
  if (!attr || attr.expiresAt < new Date()) return null
  const affiliate = await db.affiliate.findUnique({ where: { id: attr.affiliateId } })
  if (!affiliate || affiliate.status !== 'APPROVED' || affiliate.userId === userId) return null
  return affiliate.id
}
