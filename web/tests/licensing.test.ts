import { describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import { activateLicense, findDeviceByToken, issueOrExtendLicense } from '@/lib/licensing'
import { createUser, uniq } from './helpers'

const DAY = 86400_000

async function issue(userId: string, planSlug: string) {
  const plan = await db.plan.findUniqueOrThrow({ where: { slug: planSlug } })
  return db.$transaction((tx) => issueOrExtendLicense(tx, { userId, plan }))
}

describe('activateLicense', () => {
  test('primeiro uso ativa, vincula device e liga o relógio de expiração', async () => {
    const user = await createUser('lic-ativa')
    const issued = await issue(user.id, 'mensal')
    expect(issued.extended).toBe(false)
    expect(issued.plainKey).not.toBeNull()
    expect(issued.license.expiresAt).toBeNull() // relógio só liga na ativação

    const before = Date.now()
    const result = await activateLicense(issued.plainKey!, uniq('hwid'))
    expect(result.code).toBe('OK')
    expect(result.deviceToken).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(result.license!.status).toBe('ACTIVE')
    expect(result.plainExpiresAt).not.toBeNull()
    const diff = result.plainExpiresAt!.getTime() - before
    expect(diff).toBeGreaterThanOrEqual(30 * DAY - 1000)
    expect(diff).toBeLessThanOrEqual(30 * DAY + 60_000)
    const tokenDevice = await findDeviceByToken(result.deviceToken!)
    expect(tokenDevice?.licenseId).toBe(result.license!.id)
    expect(tokenDevice?.tokenHash).not.toBe(result.deviceToken)
  })

  test('segundo device além do limite retorna DEVICE_LIMIT; mesmo hwid revalida OK', async () => {
    const user = await createUser('lic-limite')
    const issued = await issue(user.id, 'mensal') // deviceLimit 1
    const hwid = uniq('hwid')

    const first = await activateLicense(issued.plainKey!, hwid)
    expect(first.code).toBe('OK')
    const expiresAt = first.license!.expiresAt!.getTime()

    const other = await activateLicense(issued.plainKey!, uniq('hwid_outro'))
    expect(other.code).toBe('INSTALLATION_CONSUMED')

    const again = await activateLicense(issued.plainKey!, hwid)
    expect(again.code).toBe('OK')
    expect(again.deviceToken).not.toBe(first.deviceToken)
    expect(await findDeviceByToken(first.deviceToken!)).toBeNull()
    expect((await findDeviceByToken(again.deviceToken!))?.hwid).toBe(hwid)
    // revalidação não mexe no relógio
    expect(again.license!.expiresAt!.getTime()).toBe(expiresAt)

    const devices = await db.licenseDevice.count({ where: { licenseId: issued.license.id } })
    expect(devices).toBe(1)
  })

  test('plano vitalício ativa com expiresAt null', async () => {
    const user = await createUser('lic-vita')
    const issued = await issue(user.id, 'vitalicio')
    const result = await activateLicense(issued.plainKey!, uniq('hwid'))
    expect(result.code).toBe('OK')
    expect(result.license!.status).toBe('ACTIVE')
    expect(result.license!.expiresAt).toBeNull()
    expect(result.plainExpiresAt).toBeNull()
  })
})

describe('issueOrExtendLicense — extensão', () => {
  test('nova compra com licença ativa SOMA dias ao expiresAt existente', async () => {
    const user = await createUser('lic-ext')
    const issued = await issue(user.id, 'mensal')
    const activated = await activateLicense(issued.plainKey!, uniq('hwid'))
    const base = activated.license!.expiresAt!.getTime()

    const extended = await issue(user.id, 'mensal')
    expect(extended.extended).toBe(true)
    expect(extended.plainKey).toBeNull() // a chave não muda
    expect(extended.license.id).toBe(issued.license.id) // mesma licença
    expect(extended.license.expiresAt!.getTime()).toBe(base + 30 * DAY)

    const total = await db.license.count({ where: { userId: user.id } })
    expect(total).toBe(1)
  })
})
