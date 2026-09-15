'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createOrder } from '@/lib/checkout'
import { decrypt, randomToken } from '@/lib/crypto'
import { getPaymentProvider } from '@/lib/payments'
import { rateLimit } from '@/lib/ratelimit'
import { issueResellerLicense } from '@/lib/resellers'
import { getSetting } from '@/lib/settings'
import { assertPublicHttpsUrl } from '@/lib/ssrf'

export interface RevendaFormState {
  error: string | null
  ok?: boolean
}

async function approvedReseller() {
  const user = await requireUser()
  const reseller = await db.reseller.findUnique({ where: { userId: user.id } })
  if (!reseller || reseller.status !== 'APPROVED') redirect('/revenda')
  return { user, reseller }
}

// ===== inscrição =====

const inscricaoSchema = z.object({
  businessName: z.string().trim().min(2, 'Informe o nome do negócio.').max(120),
  note: z.string().trim().max(1000).optional(),
})

export async function criarRevendaAction(
  _prev: RevendaFormState,
  formData: FormData,
): Promise<RevendaFormState> {
  const user = await requireUser()
  if (!(await rateLimit(`revenda-apply:${user.id}`, 3, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }

  const parsed = inscricaoSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const existing = await db.reseller.findUnique({ where: { userId: user.id } })
  if (existing) {
    revalidatePath('/revenda')
    return { error: null, ok: true }
  }

  const reseller = await db.reseller.create({ data: { userId: user.id, status: 'PENDING' } })
  // ponytail: Reseller não tem campo de nome/nota — a candidatura fica registrada
  // na auditoria, onde o admin avalia antes de aprovar.
  await audit({
    actorUserId: user.id,
    action: 'reseller.apply',
    entity: 'reseller',
    entityId: reseller.id,
    after: { businessName: parsed.data.businessName, note: parsed.data.note ?? null },
  })
  revalidatePath('/revenda')
  return { error: null, ok: true }
}

// ===== compra de créditos =====

export async function comprarCreditosAction(planSlug: string): Promise<void> {
  const { user } = await approvedReseller()

  const plan = await db.plan.findUnique({ where: { slug: planSlug }, include: { product: true } })
  if (!plan || !plan.active || plan.product.slug !== 'creditos')
    redirect('/revenda/creditos?erro=pack')

  let orderId: string
  try {
    const order = await createOrder(user.id, planSlug)
    await getPaymentProvider().createCheckout(order, user, 'PIX')
    orderId = order.id
  } catch {
    redirect('/revenda/creditos?erro=pagamento')
  }
  redirect(`/comprar/pedido/${orderId}`)
}

// ===== emissão de licença =====

export interface EmitirState {
  error: string | null
  ok?: boolean
  plainKey?: string
  planName?: string
  costCents?: number
  balanceAfter?: number
}

export async function emitirLicencaAction(
  _prev: EmitirState,
  formData: FormData,
): Promise<EmitirState> {
  const { user, reseller } = await approvedReseller()

  const planId = String(formData.get('planId') ?? '')
  const customerLabel = String(formData.get('customerLabel') ?? '').trim().slice(0, 120)
  if (!planId) return { error: 'Selecione um plano.' }

  const plan = await db.plan.findUnique({ where: { id: planId }, include: { product: true } })
  if (!plan || !plan.active || plan.product.slug !== 'resync')
    return { error: 'Plano indisponível. Recarregue a página e tente de novo.' }

  try {
    const issued = await issueResellerLicense(reseller.id, planId, {
      customerLabel: customerLabel || undefined,
      actorUserId: user.id,
    })
    revalidatePath('/revenda')
    if (!issued.plainKey)
      return { error: 'A emissão estendeu uma licença existente. Verifique sua lista de licenças.' }
    return {
      error: null,
      ok: true,
      plainKey: issued.plainKey,
      planName: plan.name,
      costCents: issued.costCents,
      balanceAfter: issued.balanceAfter,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Falha ao emitir. Tente de novo.' }
  }
}

// ===== revelar chave =====

export async function revelarChaveAction(
  licenseId: string,
): Promise<{ key: string } | { error: string }> {
  const { user, reseller } = await approvedReseller()
  if (!(await rateLimit(`revenda-reveal:${user.id}`, 20, 60_000)))
    return { error: 'Muitas revelações seguidas. Aguarde um minuto.' }

  const license = await db.license.findFirst({ where: { id: licenseId, resellerId: reseller.id } })
  if (!license) return { error: 'Licença não encontrada.' }

  await db.licenseEvent.create({
    data: { licenseId: license.id, type: 'KEY_REVEALED', actorUserId: user.id, meta: { by: 'reseller' } },
  })
  await audit({
    actorUserId: user.id,
    action: 'reseller.license_reveal',
    entity: 'license',
    entityId: license.id,
  })
  return { key: decrypt(license.keyCiphertext) }
}

// ===== webhook =====

export async function salvarWebhookAction(
  _prev: RevendaFormState,
  formData: FormData,
): Promise<RevendaFormState> {
  const { user, reseller } = await approvedReseller()

  const webhookUrl = String(formData.get('webhookUrl') ?? '').trim().slice(0, 500)
  if (webhookUrl) {
    try {
      await assertPublicHttpsUrl(webhookUrl)
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'URL inválida. Confira e tente de novo.' }
    }
  }

  await db.reseller.update({
    where: { id: reseller.id },
    data: {
      webhookUrl: webhookUrl || null,
      // segredo HMAC gerado uma vez, no primeiro cadastro
      webhookSecret: webhookUrl && !reseller.webhookSecret ? randomToken() : reseller.webhookSecret,
    },
  })
  await audit({
    actorUserId: user.id,
    action: 'reseller.webhook_update',
    entity: 'reseller',
    entityId: reseller.id,
    before: { webhookUrl: reseller.webhookUrl },
    after: { webhookUrl: webhookUrl || null },
  })
  revalidatePath('/revenda')
  return { error: null, ok: true }
}

// ===== revogar =====

export async function revogarLicencaAction(
  _prev: RevendaFormState,
  formData: FormData,
): Promise<RevendaFormState> {
  const { user, reseller } = await approvedReseller()

  const canRevoke = await getSetting('reseller_can_revoke', true)
  if (!canRevoke) return { error: 'Revogação por revendedor está desativada. Abra um ticket com o suporte.' }

  const licenseId = String(formData.get('licenseId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length < 5) return { error: 'Informe o motivo da revogação (mínimo 5 caracteres).' }

  const license = await db.license.findFirst({ where: { id: licenseId, resellerId: reseller.id } })
  if (!license) return { error: 'Licença não encontrada.' }
  if (license.status === 'REVOKED') return { error: 'Esta licença já está revogada.' }

  await db.$transaction(async (tx) => {
    await tx.license.update({ where: { id: license.id }, data: { status: 'REVOKED' } })
    await tx.licenseEvent.create({
      data: { licenseId: license.id, type: 'REVOKED', actorUserId: user.id, meta: { reason, by: 'reseller' } },
    })
    await audit(
      {
        actorUserId: user.id,
        action: 'reseller.license_revoke',
        entity: 'license',
        entityId: license.id,
        before: { status: license.status },
        after: { status: 'REVOKED' },
        reason,
      },
      tx,
    )
  })
  revalidatePath('/revenda/licencas')
  return { error: null, ok: true }
}
