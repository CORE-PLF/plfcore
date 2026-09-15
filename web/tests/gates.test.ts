import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { safeNext } from '@/lib/auth'
import { db } from '@/lib/db'
import { getGates } from '@/lib/gates'
import {
  getInstaller,
  installerPath,
  signInstallerToken,
  verifyInstallerToken,
} from '@/lib/installer'
import { effectiveMinVersion } from '@/app/api/v1/_lib'
import { uniq } from './helpers'

const GATE_KEYS = [
  'maintenance_mode',
  'checkout_enabled',
  'activation_enabled',
  'min_desktop_version',
  'support_url',
]

// snapshot das linhas Setting dos gates — restaurado ao final para não afetar
// outras suítes nem o ambiente de dev
let snapshot: { key: string; value: unknown }[] = []

beforeAll(async () => {
  snapshot = await db.setting.findMany({
    where: { key: { in: GATE_KEYS } },
    select: { key: true, value: true },
  })
  await db.setting.deleteMany({ where: { key: { in: GATE_KEYS } } })
})

afterAll(async () => {
  await db.setting.deleteMany({ where: { key: { in: GATE_KEYS } } })
  for (const row of snapshot) {
    await db.setting.create({ data: { key: row.key, value: row.value as never } })
  }
})

describe('getGates', () => {
  test('sem linhas Setting → defaults de operação normal', async () => {
    const gates = await getGates()
    expect(gates.maintenanceMode).toBe(false)
    expect(gates.checkoutEnabled).toBe(true)
    expect(gates.activationEnabled).toBe(true)
    expect(gates.minDesktopVersion).toBe('')
  })

  test('checkout_enabled=false desliga o checkout', async () => {
    await db.setting.create({ data: { key: 'checkout_enabled', value: false } })
    const gates = await getGates()
    expect(gates.checkoutEnabled).toBe(false)
    await db.setting.delete({ where: { key: 'checkout_enabled' } })
  })
})

describe('getInstaller', () => {
  test('AppVersion publicada (stable) vira arquivo do volume com checksum normalizado', async () => {
    const version = uniq('inst')
    const created = await db.appVersion.create({
      data: {
        version,
        channel: 'stable',
        notes: 'notas de teste',
        fileName: 'ResyncSetup-teste.exe',
        checksum: `sha256:${'A'.repeat(64)}`,
        // futuro próximo: garante que esta é a mais recente na ordenação
        publishedAt: new Date(Date.now() + 60_000),
        active: true,
      },
    })
    try {
      const inst = await getInstaller()
      expect(inst).not.toBeNull()
      expect(inst?.version).toBe(version)
      expect(inst?.checksum).toBe('a'.repeat(64))
      expect(inst?.fileName).toBe('ResyncSetup-teste.exe')
    } finally {
      await db.appVersion.delete({ where: { id: created.id } })
    }
  })
})

describe('installerPath', () => {
  test('nome simples resolve dentro do volume; travessia e barra são rejeitadas', () => {
    expect(installerPath('ResyncSetup-1.4.0.exe')).toContain('ResyncSetup-1.4.0.exe')
    expect(installerPath('../../etc/passwd')).toBeNull()
    expect(installerPath('sub/dir.exe')).toBeNull()
    expect(installerPath('..')).toBeNull()
    expect(installerPath('')).toBeNull()
  })
})

describe('token assinado do instalador', () => {
  test('token válido passa; outra versão, assinatura trocada e token vencido não', () => {
    const token = signInstallerToken('1.4.0')
    expect(verifyInstallerToken('1.4.0', token)).toBe(true)
    expect(verifyInstallerToken('1.5.0', token)).toBe(false)
    expect(verifyInstallerToken('1.4.0', `${token.split('.')[0]}.${'0'.repeat(64)}`)).toBe(false)
    expect(verifyInstallerToken('1.4.0', signInstallerToken('1.4.0', -1))).toBe(false)
    expect(verifyInstallerToken('1.4.0', null)).toBe(false)
  })
})

describe('safeNext', () => {
  test('aceita caminho do próprio site e recusa destino externo', () => {
    expect(safeNext('/comprar/mensal?cupom=X')).toBe('/comprar/mensal?cupom=X')
    expect(safeNext('//evil.com')).toBeNull()
    expect(safeNext('/\\evil.com')).toBeNull()
    expect(safeNext('https://evil.com')).toBeNull()
    expect(safeNext('/painel\nLocation: https://evil.com')).toBeNull()
    expect(safeNext('')).toBeNull()
    expect(safeNext(null)).toBeNull()
  })
})

describe('effectiveMinVersion', () => {
  test('retorna o maior semver — 1.2.0 vs 1.10.0 → 1.10.0', () => {
    expect(effectiveMinVersion('1.2.0', '1.10.0')).toBe('1.10.0')
    expect(effectiveMinVersion('1.10.0', '1.2.0')).toBe('1.10.0')
  })

  test('string vazia = sem mínimo daquele lado', () => {
    expect(effectiveMinVersion(null, '')).toBeNull()
    expect(effectiveMinVersion(null, '2.0.0')).toBe('2.0.0')
    expect(effectiveMinVersion('1.5.0', '')).toBe('1.5.0')
  })
})
