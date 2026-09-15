import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { createOrder } from '@/lib/checkout'
import { db } from '@/lib/db'
import {
  activateLicense,
  issueOrExtendLicense,
  licenseDisplayState,
  maskHwid,
} from '@/lib/licensing'
import { createUser, uniq } from './helpers'

const DAY = 86400_000

// Regra hash-only: hwid é SEMPRE o sha256 hex do identificador da instalação,
// nunca o identificador bruto.
function hwid(seed: string): string {
  return createHash('sha256').update(uniq(seed)).digest('hex')
}

async function issue(userId: string, intent?: 'EXTEND' | 'NEW_INSTALL') {
  const plan = await db.plan.findUniqueOrThrow({ where: { slug: 'mensal' } })
  return db.$transaction((tx) => issueOrExtendLicense(tx, { userId, plan, intent }))
}

describe('licença por instalação — ativação', () => {
  test('chave consumida (deviceLimit 1): outra instalação → INSTALLATION_CONSUMED + evento com hwid mascarado', async () => {
    const user = await createUser('inst-consumida')
    const issued = await issue(user.id)
    const hashA = hwid('a')
    const hashB = hwid('b')

    expect((await activateLicense(issued.plainKey!, hashA)).code).toBe('OK')

    const rejected = await activateLicense(issued.plainKey!, hashB)
    expect(rejected.code).toBe('INSTALLATION_CONSUMED')

    const events = await db.licenseEvent.findMany({
      where: { licenseId: issued.license.id, type: 'ACTIVATION_REJECTED_NEW_INSTALL' },
    })
    expect(events).toHaveLength(1)
    const meta = events[0].meta as { hwidMasked?: string }
    expect(meta.hwidMasked).toBe(maskHwid(hashB))
    // o hwid completo da instalação rejeitada nunca entra no evento
    expect(JSON.stringify(events[0].meta)).not.toContain(hashB)

    // a instalação original segue revalidando normalmente
    const again = await activateLicense(issued.plainKey!, hashA)
    expect(again.code).toBe('OK')
    expect(again.license!.status).toBe('ACTIVE')
  })
})

describe('licença por instalação — emissão', () => {
  test('intent NEW_INSTALL com licença viva SEMPRE cria segunda licença; a antiga fica intacta', async () => {
    const user = await createUser('inst-nova')
    const first = await issue(user.id)
    await activateLicense(first.plainKey!, hwid('a'))
    const before = await db.license.findUniqueOrThrow({
      where: { id: first.license.id },
      include: { devices: true },
    })

    const second = await issue(user.id, 'NEW_INSTALL')
    expect(second.extended).toBe(false)
    expect(second.plainKey).not.toBeNull() // chave nova
    expect(second.license.id).not.toBe(first.license.id)
    expect(second.license.expiresAt).toBeNull() // relógio só liga na ativação

    const after = await db.license.findUniqueOrThrow({
      where: { id: first.license.id },
      include: { devices: true },
    })
    expect(after.expiresAt!.getTime()).toBe(before.expiresAt!.getTime())
    expect(after.devices.map((d) => d.hwid)).toEqual(before.devices.map((d) => d.hwid))
    expect(await db.license.count({ where: { userId: user.id } })).toBe(2)
  })

  test('intent EXTEND estende a licença existente (comportamento atual preservado)', async () => {
    const user = await createUser('inst-ext')
    const first = await issue(user.id)
    await activateLicense(first.plainKey!, hwid('a'))
    const base = (
      await db.license.findUniqueOrThrow({ where: { id: first.license.id } })
    ).expiresAt!.getTime()

    const ext = await issue(user.id, 'EXTEND')
    expect(ext.extended).toBe(true)
    expect(ext.plainKey).toBeNull() // a chave não muda
    expect(ext.license.id).toBe(first.license.id)
    expect(ext.license.expiresAt!.getTime()).toBe(base + 30 * DAY)
    expect(await db.license.count({ where: { userId: user.id } })).toBe(1)
  })
})

describe('createOrder — licenseIntent', () => {
  test('grava NEW_INSTALL quando pedido; default é EXTEND', async () => {
    const user = await createUser('inst-order')
    const nova = await createOrder(user.id, 'mensal', undefined, 'NEW_INSTALL')
    expect(nova.licenseIntent).toBe('NEW_INSTALL')

    const padrao = await createOrder(user.id, 'mensal')
    expect(padrao.licenseIntent).toBe('EXTEND')
  })
})

describe('licenseDisplayState', () => {
  test('deriva o estado do painel sem mudar o status do banco', async () => {
    const user = await createUser('inst-display')
    const issued = await issue(user.id)
    expect(licenseDisplayState(issued.license, false)).toBe('SEM_ATIVACAO')

    await activateLicense(issued.plainKey!, hwid('a'))
    const active = await db.license.findUniqueOrThrow({ where: { id: issued.license.id } })
    expect(licenseDisplayState(active, false)).toBe('ATIVA')
    expect(licenseDisplayState(active, true)).toBe('CONSUMIDA_OUTRA_INSTALACAO')

    const expired = await db.license.update({
      where: { id: issued.license.id },
      data: { expiresAt: new Date(Date.now() - DAY) },
    })
    expect(licenseDisplayState(expired, true)).toBe('EXPIRADA')
  })
})

describe('maskHwid', () => {
  test('nunca devolve o hash inteiro', () => {
    const h = hwid('mask')
    const masked = maskHwid(h)
    expect(masked).not.toBe(h)
    expect(masked.length).toBeLessThan(h.length)
    expect(h.includes(masked)).toBe(false)
    // hwid curto (nunca deveria existir na regra hash-only) também não vaza
    expect(maskHwid('abc123')).toBe('****')
  })
})
