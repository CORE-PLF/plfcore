import type { License, Plan, Prisma } from '@/generated/prisma/client'
import { db } from './db'
import { encrypt, generateLicenseKey, maskLicenseKey, randomToken, sha256 } from './crypto'

type Tx = Prisma.TransactionClient

// Licença é individual e vinculada à INSTALAÇÃO (HWID-hash muda ao formatar).
// intent EXTEND (renovação): estende a licença viva do usuário — soma ao tempo
// restante, renovação antecipada não perde dias; vitalício torna vitalícia.
// intent NEW_INSTALL (instalação nova / pós-formatação): SEMPRE emite chave nova
// e nunca mexe na licença antiga — ela permanece consumida pela instalação original.

interface IssueInput {
  userId: string
  plan: Plan
  orderId?: string
  resellerId?: string
  actorUserId?: string
  intent?: 'EXTEND' | 'NEW_INSTALL'
}

export interface IssueResult {
  license: License
  plainKey: string | null // null quando foi extensão (a chave não muda)
  extended: boolean
}

export async function issueOrExtendLicense(tx: Tx, input: IssueInput): Promise<IssueResult> {
  const existing =
    input.intent === 'NEW_INSTALL'
      ? null
      : await tx.license.findFirst({
          where: {
            userId: input.userId,
            plan: { productId: input.plan.productId },
            status: { in: ['PENDING_ACTIVATION', 'ACTIVE'] },
            resellerId: input.resellerId ?? null,
          },
          orderBy: { createdAt: 'desc' },
        })

  if (existing && !input.resellerId) {
    const base =
      existing.expiresAt && existing.expiresAt > new Date() ? existing.expiresAt : new Date()
    const expiresAt =
      input.plan.durationDays === null || existing.expiresAt === null
        ? null
        : new Date(base.getTime() + input.plan.durationDays * 86400_000)
    const license = await tx.license.update({
      where: { id: existing.id },
      data: {
        expiresAt,
        status: existing.status === 'PENDING_ACTIVATION' ? 'PENDING_ACTIVATION' : 'ACTIVE',
        deviceLimit: Math.max(existing.deviceLimit, input.plan.deviceLimit),
      },
    })
    await tx.licenseEvent.create({
      data: {
        licenseId: license.id,
        type: 'EXTENDED',
        actorUserId: input.actorUserId ?? null,
        meta: { orderId: input.orderId ?? null, planId: input.plan.id, newExpiresAt: expiresAt },
      },
    })
    return { license, plainKey: null, extended: true }
  }

  const plainKey = generateLicenseKey()
  const license = await tx.license.create({
    data: {
      userId: input.userId,
      orderId: input.orderId ?? null,
      planId: input.plan.id,
      keyHash: sha256(plainKey),
      keyCiphertext: encrypt(plainKey),
      keyMasked: maskLicenseKey(plainKey),
      status: 'PENDING_ACTIVATION',
      expiresAt: null, // relógio só começa na ativação (ver activateLicense)
      deviceLimit: input.plan.deviceLimit,
      resellerId: input.resellerId ?? null,
    },
  })
  await tx.licenseEvent.create({
    data: {
      licenseId: license.id,
      type: 'ISSUED',
      actorUserId: input.actorUserId ?? null,
      meta: { orderId: input.orderId ?? null, planId: input.plan.id },
    },
  })
  return { license, plainKey, extended: false }
}

// ===== validação usada pela API v1 (aplicativo) =====

export type LicenseCheckCode =
  | 'OK'
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'BLOCKED'
  | 'REPLACED'
  | 'DEVICE_LIMIT'
  | 'DEVICE_REVOKED'
  | 'INSTALLATION_CONSUMED'

export interface LicenseCheck {
  code: LicenseCheckCode
  license?: License & { plan: Plan }
}

// HWID nunca aparece inteiro em tela, log ou evento — só as pontas.
export function maskHwid(hwid: string): string {
  if (hwid.length <= 8) return '****'
  return `${hwid.slice(0, 4)}…${hwid.slice(-4)}`
}

// Estado de exibição da licença no painel (derivado — o status do banco não muda
// por tentativa de terceiros). CONSUMIDA = viva, porém vinculada a uma instalação
// e com tentativa de ativação registrada a partir de OUTRA instalação.
export type LicenseDisplayState =
  | 'SEM_ATIVACAO'
  | 'ATIVA'
  | 'CONSUMIDA_OUTRA_INSTALACAO'
  | 'EXPIRADA'
  | 'SUSPENSA'
  | 'REVOGADA'
  | 'BLOQUEADA'
  | 'SUBSTITUIDA'

export function licenseDisplayState(
  license: License,
  hasRejectedNewInstall: boolean,
): LicenseDisplayState {
  if (license.status === 'SUSPENDED') return 'SUSPENSA'
  if (license.status === 'REVOKED') return 'REVOGADA'
  if (license.status === 'BLOCKED') return 'BLOQUEADA'
  if (license.status === 'REPLACED') return 'SUBSTITUIDA'
  if (license.status === 'EXPIRED' || (license.expiresAt && license.expiresAt < new Date()))
    return 'EXPIRADA'
  if (license.status === 'PENDING_ACTIVATION') return 'SEM_ATIVACAO'
  return hasRejectedNewInstall ? 'CONSUMIDA_OUTRA_INSTALACAO' : 'ATIVA'
}

// Licença viva do produto: é ela que dá direito a baixar o instalador e a
// escolher entre renovar e abrir nova instalação no checkout.
export async function findLiveLicense(userId: string, productSlug = 'plfcore') {
  return db.license.findFirst({
    where: {
      userId,
      status: { in: ['PENDING_ACTIVATION', 'ACTIVE'] },
      plan: { product: { slug: productSlug } },
    },
    select: { id: true },
  })
}

export async function findLicenseByKey(key: string) {
  return db.license.findUnique({
    where: { keyHash: sha256(key.trim().toUpperCase()) },
    include: { plan: true, devices: true },
  })
}

export function licenseStatusCheck(
  license: (License & { plan: Plan }) | null,
): LicenseCheck {
  if (!license) return { code: 'NOT_FOUND' }
  if (license.status === 'SUSPENDED') return { code: 'SUSPENDED', license }
  if (license.status === 'REVOKED') return { code: 'REVOKED', license }
  if (license.status === 'BLOCKED') return { code: 'BLOCKED', license }
  if (license.status === 'REPLACED') return { code: 'REPLACED', license }
  if (license.expiresAt && license.expiresAt < new Date()) return { code: 'EXPIRED', license }
  if (license.status === 'EXPIRED') return { code: 'EXPIRED', license }
  return { code: 'OK', license }
}

// Ativação: primeiro uso liga o relógio de expiração e vincula o dispositivo.
export async function activateLicense(
  key: string,
  hwid: string,
  deviceName?: string,
  appVersion?: string,
): Promise<LicenseCheck & { plainExpiresAt?: Date | null; deviceToken?: string }> {
  return db.$transaction(async (tx) => {
    const license = await tx.license.findUnique({
      where: { keyHash: sha256(key.trim().toUpperCase()) },
      include: { plan: true, devices: true },
    })
    const check = licenseStatusCheck(license)
    if (check.code !== 'OK' || !license) return check

    const activeDevices = license.devices.filter((d) => !d.revokedAt)
    const known = license.devices.find((d) => d.hwid === hwid)
    if (known?.revokedAt) return { code: 'DEVICE_REVOKED', license }
    if (!known && activeDevices.length >= license.deviceLimit) {
      // instalação diferente tentando usar uma chave já consumida (ex.: Windows
      // formatado). Registra a tentativa — o painel mostra a licença como
      // CONSUMIDA EM OUTRA INSTALAÇÃO e orienta a compra de nova licença.
      await tx.licenseEvent.create({
        data: {
          licenseId: license.id,
          type: 'ACTIVATION_REJECTED_NEW_INSTALL',
          meta: { hwidMasked: maskHwid(hwid), deviceName: deviceName ?? null, appVersion: appVersion ?? null },
        },
      })
      return { code: license.deviceLimit === 1 ? 'INSTALLATION_CONSUMED' : 'DEVICE_LIMIT', license }
    }

    const deviceToken = randomToken(32)
    const tokenHash = sha256(deviceToken)
    if (known) {
      await tx.licenseDevice.update({
        where: { id: known.id },
        data: {
          lastSeenAt: new Date(),
          appVersion: appVersion ?? known.appVersion,
          tokenHash,
          tokenIssuedAt: new Date(),
          tokenLastUsedAt: new Date(),
        },
      })
    } else {
      await tx.licenseDevice.create({
        data: {
          licenseId: license.id,
          hwid,
          name: deviceName ?? null,
          appVersion: appVersion ?? null,
          tokenHash,
          tokenIssuedAt: new Date(),
          tokenLastUsedAt: new Date(),
        },
      })
    }

    let expiresAt = license.expiresAt
    if (license.status === 'PENDING_ACTIVATION') {
      expiresAt =
        license.plan.durationDays === null
          ? null
          : new Date(Date.now() + license.plan.durationDays * 86400_000)
      await tx.license.update({
        where: { id: license.id },
        data: { status: 'ACTIVE', activatedAt: new Date(), expiresAt, lastValidatedAt: new Date() },
      })
      await tx.licenseEvent.create({
        data: { licenseId: license.id, type: 'ACTIVATED', meta: { hwidMasked: maskHwid(hwid), expiresAt } },
      })
    } else {
      await tx.license.update({
        where: { id: license.id },
        data: { lastValidatedAt: new Date() },
      })
    }

    const fresh = await tx.license.findUniqueOrThrow({
      where: { id: license.id },
      include: { plan: true },
    })
    return { code: 'OK', license: fresh, plainExpiresAt: expiresAt, deviceToken }
  })
}

export async function findDeviceByToken(token: string) {
  return db.licenseDevice.findUnique({
    where: { tokenHash: sha256(token) },
    include: { license: { include: { plan: true } } },
  })
}
