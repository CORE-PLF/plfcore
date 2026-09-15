import { beforeAll, describe, expect, test } from 'vitest'
import { createOrder, quoteOrder } from '@/lib/checkout'
import { db } from '@/lib/db'
import { applyPercentBps } from '@/lib/money'
import { createUser, mensalPlan, uniq } from './helpers'

let subtotal = 0
let planId = ''

beforeAll(async () => {
  const plan = await mensalPlan()
  subtotal = plan.prices[0].amountCents
  planId = plan.id
})

function makeCoupon(data: Partial<Parameters<typeof db.coupon.create>[0]['data']> = {}) {
  return db.coupon.create({
    data: {
      code: uniq('CUP').toUpperCase(),
      type: 'PERCENT',
      value: 1000,
      ...data,
    },
  })
}

describe('quoteOrder', () => {
  test('plano mensal retorna subtotal do banco, sem desconto', async () => {
    const quote = await quoteOrder('mensal')
    expect(quote).not.toBeNull()
    expect(quote!.planId).toBe(planId)
    expect(quote!.subtotalCents).toBe(subtotal)
    expect(quote!.discountCents).toBe(0)
    expect(quote!.totalCents).toBe(subtotal)
    expect(quote!.couponError).toBeNull()
  })

  test('plano inexistente retorna null', async () => {
    expect(await quoteOrder(uniq('plano-fantasma'))).toBeNull()
  })

  test('cupom PERCENT aplica desconto arredondado pra cima', async () => {
    const coupon = await makeCoupon({ value: 1500 })
    const quote = await quoteOrder('mensal', coupon.code)
    const expected = applyPercentBps(subtotal, 1500)
    expect(quote!.couponError).toBeNull()
    expect(quote!.couponId).toBe(coupon.id)
    expect(quote!.discountCents).toBe(expected)
    expect(quote!.totalCents).toBe(subtotal - expected)
  })

  test('cupom expirado retorna couponError e não desconta', async () => {
    const coupon = await makeCoupon({ endsAt: new Date(Date.now() - 86400_000) })
    const quote = await quoteOrder('mensal', coupon.code)
    expect(quote!.couponError).toMatch(/expirado/i)
    expect(quote!.discountCents).toBe(0)
    expect(quote!.totalCents).toBe(subtotal)
  })

  test('cupom esgotado retorna couponError', async () => {
    const coupon = await makeCoupon({ maxRedemptions: 0 })
    const quote = await quoteOrder('mensal', coupon.code)
    expect(quote!.couponError).toMatch(/esgotado/i)
    expect(quote!.discountCents).toBe(0)
  })

  test('valor mínimo não atingido retorna couponError', async () => {
    const coupon = await makeCoupon({ minAmountCents: subtotal + 1 })
    const quote = await quoteOrder('mensal', coupon.code)
    expect(quote!.couponError).toMatch(/mínimo/i)
    expect(quote!.discountCents).toBe(0)
  })
})

describe('createOrder', () => {
  test('grava pedido com total recalculado no servidor', async () => {
    const user = await createUser('checkout')
    const coupon = await makeCoupon({ value: 1000 })
    const order = await createOrder(user.id, 'mensal', coupon.code)
    const discount = applyPercentBps(subtotal, 1000)

    expect(order.status).toBe('AWAITING_PAYMENT')
    expect(order.subtotalCents).toBe(subtotal)
    expect(order.discountCents).toBe(discount)
    expect(order.totalCents).toBe(subtotal - discount)
    expect(order.couponId).toBe(coupon.id)

    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(saved.totalCents).toBe(subtotal - discount)
  })

  test('cupom inválido derruba a criação do pedido', async () => {
    const user = await createUser('checkout-err')
    const coupon = await makeCoupon({ endsAt: new Date(Date.now() - 1000) })
    await expect(createOrder(user.id, 'mensal', coupon.code)).rejects.toThrow(/expirado/i)
  })
})
