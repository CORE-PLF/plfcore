'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { pixDe, requireApprovedAffiliate, saldoDisponivelCents } from '@/app/afiliado/shared'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { rateLimit } from '@/lib/ratelimit'
import { getSettingNumber } from '@/lib/settings'

export interface AfiliadoFormState {
  error: string | null
  ok?: boolean
}

const inscricaoSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,20}$/, 'Código inválido: use 4 a 20 caracteres, só letras A–Z e números.'),
  pix: z
    .string()
    .trim()
    .min(3, 'Informe a chave PIX para receber as comissões.')
    .max(140, 'Chave PIX longa demais.'),
})

export async function criarAfiliadoAction(
  _prev: AfiliadoFormState,
  formData: FormData,
): Promise<AfiliadoFormState> {
  const user = await requireUser()
  if (!(await rateLimit(`afiliado:apply:${user.id}`, 3, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }

  const parsed = inscricaoSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { code, pix } = parsed.data

  const existente = await db.affiliate.findUnique({ where: { userId: user.id } })
  if (existente) return { error: 'Você já tem uma inscrição registrada.' }

  try {
    const affiliate = await db.affiliate.create({
      data: { userId: user.id, code, payoutInfo: { pix } },
    })
    await audit({
      actorUserId: user.id,
      action: 'affiliate.apply',
      entity: 'affiliate',
      entityId: affiliate.id,
      after: { code, status: 'PENDING' },
    })
  } catch (e) {
    // corrida no código único (userId único também cai aqui — mesma resposta serve)
    if ((e as { code?: string }).code === 'P2002')
      return { error: 'Este código já está em uso. Escolha outro.' }
    throw e
  }
  redirect('/afiliado')
}

const saqueSchema = z.object({
  valor: z.string().trim().min(1, 'Informe o valor do saque.'),
  pix: z.string().trim().min(3, 'Informe a chave PIX.').max(140, 'Chave PIX longa demais.'),
})

export async function solicitarSaqueAction(
  _prev: AfiliadoFormState,
  formData: FormData,
): Promise<AfiliadoFormState> {
  const { user, affiliate } = await requireApprovedAffiliate()
  if (!(await rateLimit(`afiliado:saque:${user.id}`, 5, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }

  const parsed = saqueSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const valorCents = Math.round(Number(parsed.data.valor.replace(/\./g, '').replace(',', '.')) * 100)
  if (!Number.isFinite(valorCents) || valorCents <= 0)
    return { error: 'Valor inválido. Use números, ex.: 150,00.' }

  const minCents = await getSettingNumber('payout_min_cents', 5000)
  if (valorCents < minCents)
    return { error: `Valor abaixo do mínimo de saque (${formatCents(minCents)}).` }

  const falha = await db.$transaction(async (tx) => {
    // trava a linha do afiliado: dois saques simultâneos não passam pelo mesmo saldo
    await tx.$queryRaw`SELECT id FROM Affiliate WHERE id = ${affiliate.id} FOR UPDATE`
    const saldo = await saldoDisponivelCents(affiliate.id, tx)
    if (valorCents > saldo)
      return { error: `Saldo insuficiente. Disponível: ${formatCents(Math.max(saldo, 0))}.` }
    const payout = await tx.payoutRequest.create({
      data: { affiliateId: affiliate.id, amountCents: valorCents, pixKey: parsed.data.pix },
    })
    await audit(
      {
        actorUserId: user.id,
        action: 'affiliate.payout_request',
        entity: 'payout_request',
        entityId: payout.id,
        after: { amountCents: valorCents },
      },
      tx,
    )
    return null
  })
  if (falha) return falha

  revalidatePath('/afiliado/saques')
  redirect('/afiliado/saques')
}

export async function atualizarPixAction(
  _prev: AfiliadoFormState,
  formData: FormData,
): Promise<AfiliadoFormState> {
  const { user, affiliate } = await requireApprovedAffiliate()
  const parsed = z
    .string()
    .trim()
    .min(3, 'Informe a chave PIX.')
    .max(140, 'Chave PIX longa demais.')
    .safeParse(formData.get('pix'))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const anterior = pixDe(affiliate)
  await db.affiliate.update({
    where: { id: affiliate.id },
    data: { payoutInfo: { pix: parsed.data } },
  })
  await audit({
    actorUserId: user.id,
    action: 'affiliate.pix_update',
    entity: 'affiliate',
    entityId: affiliate.id,
    before: { pix: anterior },
    after: { pix: parsed.data },
  })
  revalidatePath('/afiliado/config')
  return { error: null, ok: true }
}
