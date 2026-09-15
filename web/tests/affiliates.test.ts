import { describe, expect, test } from 'vitest'
import { attachAttribution, registerClick, resolveAffiliateForOrder } from '@/lib/affiliates'
import { db } from '@/lib/db'
import { createUser, uniq } from './helpers'

async function makeAffiliate(status: 'PENDING' | 'APPROVED' = 'APPROVED') {
  const user = await createUser('aff')
  return db.affiliate.create({
    data: { userId: user.id, code: uniq('AF').toUpperCase(), status },
  })
}

describe('registerClick', () => {
  test('só registra clique para afiliado APPROVED', async () => {
    const affiliate = await makeAffiliate('PENDING')

    expect(await registerClick(affiliate.code, {})).toBeNull()
    expect(await db.affiliateClick.count({ where: { affiliateId: affiliate.id } })).toBe(0)

    await db.affiliate.update({ where: { id: affiliate.id }, data: { status: 'APPROVED' } })
    const result = await registerClick(affiliate.code, {
      ip: '10.0.0.1',
      userAgent: 'vitest',
      landingPage: '/precos',
    })
    expect(result).not.toBeNull()
    expect(result!.affiliate.id).toBe(affiliate.id)
    expect(await db.affiliateClick.count({ where: { affiliateId: affiliate.id } })).toBe(1)
  })

  test('código inexistente retorna null', async () => {
    expect(await registerClick(uniq('NADA').toUpperCase(), {})).toBeNull()
  })
})

describe('attachAttribution', () => {
  test('bloqueia autoindicação; cria atribuição pra terceiro', async () => {
    const affiliate = await makeAffiliate()

    // o dono do código não pode se autoindicar
    await attachAttribution(affiliate.userId, affiliate.code)
    expect(await db.affiliateAttribution.findUnique({ where: { userId: affiliate.userId } })).toBeNull()

    const cliente = await createUser('cliente')
    await attachAttribution(cliente.id, affiliate.code)
    const attr = await db.affiliateAttribution.findUnique({ where: { userId: cliente.id } })
    expect(attr).not.toBeNull()
    expect(attr!.affiliateId).toBe(affiliate.id)
    expect(attr!.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('resolveAffiliateForOrder', () => {
  test('resolve dentro da janela e retorna null depois de expirar', async () => {
    const affiliate = await makeAffiliate()
    const cliente = await createUser('cliente-janela')
    await attachAttribution(cliente.id, affiliate.code)

    expect(await resolveAffiliateForOrder(cliente.id)).toBe(affiliate.id)

    await db.affiliateAttribution.update({
      where: { userId: cliente.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await resolveAffiliateForOrder(cliente.id)).toBeNull()
  })

  test('sem atribuição retorna null', async () => {
    const cliente = await createUser('sem-attr')
    expect(await resolveAffiliateForOrder(cliente.id)).toBeNull()
  })
})
