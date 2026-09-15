import type { Coupon } from '@/generated/prisma/client'
import { db } from './db'
import { applyPercentBps } from './money'
import { resolveAffiliateForOrder } from './affiliates'

// O preço NUNCA vem do navegador: recalculado aqui a partir do plano + cupom.

export interface Quote {
  planId: string
  currency: string
  subtotalCents: number
  discountCents: number
  totalCents: number
  couponId: string | null
  couponError: string | null
}

export async function quoteOrder(planSlug: string, couponCode?: string, userId?: string): Promise<Quote | null> {
  const plan = await db.plan.findUnique({
    where: { slug: planSlug },
    include: { prices: { where: { active: true, currency: 'BRL' } } },
  })
  if (!plan || !plan.active || plan.prices.length === 0) return null
  const price = plan.prices[0]

  let discountCents = 0
  let couponId: string | null = null
  let couponError: string | null = null

  if (couponCode) {
    const result = await validateCoupon(couponCode, plan.id, price.amountCents, userId)
    if ('error' in result) couponError = result.error
    else {
      couponId = result.coupon.id
      discountCents =
        result.coupon.type === 'PERCENT'
          ? applyPercentBps(price.amountCents, result.coupon.value)
          : Math.min(result.coupon.value, price.amountCents)
    }
  }

  return {
    planId: plan.id,
    currency: price.currency,
    subtotalCents: price.amountCents,
    discountCents,
    totalCents: Math.max(0, price.amountCents - discountCents),
    couponId,
    couponError,
  }
}

async function validateCoupon(
  code: string,
  planId: string,
  amountCents: number,
  userId?: string,
): Promise<{ coupon: Coupon } | { error: string }> {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } })
  if (!coupon || !coupon.active) return { error: 'Cupom inválido.' }
  const now = new Date()
  if (coupon.startsAt && coupon.startsAt > now) return { error: 'Cupom ainda não está valendo.' }
  if (coupon.endsAt && coupon.endsAt < now) return { error: 'Cupom expirado.' }
  if (coupon.minAmountCents && amountCents < coupon.minAmountCents)
    return { error: 'Valor mínimo do cupom não atingido.' }
  const planIds = coupon.planIds as string[] | null
  if (planIds && planIds.length > 0 && !planIds.includes(planId))
    return { error: 'Cupom não vale para este plano.' }
  if (coupon.maxRedemptions !== null) {
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id } })
    if (used >= coupon.maxRedemptions) return { error: 'Cupom esgotado.' }
  }
  if (userId) {
    const mine = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } })
    if (mine >= coupon.perUserLimit) return { error: 'Você já usou este cupom.' }
  }
  return { coupon }
}

export async function createOrder(
  userId: string,
  planSlug: string,
  couponCode?: string,
  intent: 'EXTEND' | 'NEW_INSTALL' = 'EXTEND',
) {
  const quote = await quoteOrder(planSlug, couponCode, userId)
  if (!quote) throw new Error('Plano indisponível.')
  if (quote.couponError) throw new Error(quote.couponError)

  const affiliateId = await resolveAffiliateForOrder(userId)
  return db.order.create({
    data: {
      userId,
      planId: quote.planId,
      currency: quote.currency,
      subtotalCents: quote.subtotalCents,
      discountCents: quote.discountCents,
      totalCents: quote.totalCents,
      status: 'AWAITING_PAYMENT',
      couponId: quote.couponId,
      affiliateId,
      licenseIntent: intent,
    },
  })
}
