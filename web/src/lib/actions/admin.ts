'use server'

// Ações do painel administrativo. Toda mutação: requireStaff no nível certo,
// motivo obrigatório onde indicado e auditoria com before/after.

import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Prisma } from '@/generated/prisma/client'
import { TOTP_COOKIE, TOTP_HOURS, totpCookieValue } from '@/app/admin/totp-cookie'
import { randomBytes } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { audit } from '@/lib/audit'
import { requireStaff } from '@/lib/auth'
import { BRAND } from '@/lib/brand'
import {
  generateTotpSecret,
  openTotpSecret,
  randomToken,
  sealTotpSecret,
  sha256,
  verifyPassword,
  verifyTotp,
} from '@/lib/crypto'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { installerPath, sha256File } from '@/lib/installer'
import { realIp } from '@/lib/ip'
import { qrPath, type QrPath } from '@/lib/qr'
import { processPaymentEvent } from '@/lib/fulfillment'
import { issueOrExtendLicense, maskHwid } from '@/lib/licensing'
import { rateLimit } from '@/lib/ratelimit'
import { requestRefund } from '@/lib/refunds'
import { addCredits } from '@/lib/resellers'
import { revokeAllSessions } from '@/lib/session'
import { setSetting } from '@/lib/settings'

// ===== helpers =====

function str(fd: FormData, name: string): string {
  return String(fd.get(name) ?? '').trim()
}

function intOr(fd: FormData, name: string, fallback: number | null = null): number | null {
  const v = str(fd, name)
  if (!v) return fallback
  const n = Number(v)
  return Number.isInteger(n) ? n : fallback
}

function dateOr(fd: FormData, name: string): Date | null {
  const v = str(fd, name)
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

// "R$ 199,90" | "199,90" | "199.90" → centavos
function parseMoneyCents(v: string): number | null {
  let s = v.replace(/[^\d.,]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

async function clientIp(): Promise<string | null> {
  return realIp(await headers())
}

function back(path: string, q: { ok?: string; erro?: string }): never {
  const [key, msg] = q.erro !== undefined ? ['erro', q.erro] : ['ok', q.ok ?? '']
  redirect(`${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(msg)}`)
}

function reasonOrBack(fd: FormData, path: string): string {
  const reason = str(fd, 'reason')
  if (reason.length < 4) back(path, { erro: 'Motivo obrigatório (mínimo 4 caracteres).' })
  return reason
}

async function setTotpOkCookie(userId: string): Promise<void> {
  const jar = await cookies()
  jar.set(TOTP_COOKIE, totpCookieValue(userId), {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/admin',
    maxAge: TOTP_HOURS * 3600,
  })
}

// ===== 2FA — portão de entrada do painel =====

export interface TotpGateState {
  error: string | null
}

export async function totpGateAction(_prev: TotpGateState, formData: FormData): Promise<TotpGateState> {
  const user = await requireStaff('SUPPORT')
  if (!user.totpSecret) redirect('/admin')
  if (!(await rateLimit(`totp-gate:${user.id}`, 5, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }
  const code = str(formData, 'code')

  if (/^\d{6}$/.test(code)) {
    if (!verifyTotp(openTotpSecret(user.totpSecret), code)) {
      await audit({ actorUserId: user.id, action: 'admin.totp_failed', entity: 'user', entityId: user.id, ip: await clientIp() })
      return { error: 'Código inválido. Confira o relógio do dispositivo e tente de novo.' }
    }
  } else {
    // código de recuperação da 2FA (uso único) — para autenticador perdido
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const row = normalized.length >= 8
      ? await db.recoveryCode.findUnique({ where: { codeHash: sha256(normalized) } })
      : null
    if (!row || row.userId !== user.id || row.kind !== 'TOTP' || row.usedAt) {
      await audit({ actorUserId: user.id, action: 'admin.totp_failed', entity: 'user', entityId: user.id, ip: await clientIp() })
      return { error: 'Código inválido. Use o código de 6 dígitos do autenticador ou um código de recuperação não utilizado.' }
    }
    await db.recoveryCode.update({ where: { id: row.id }, data: { usedAt: new Date() } })
    await audit({ actorUserId: user.id, action: 'admin.totp_recovery_used', entity: 'user', entityId: user.id, ip: await clientIp() })
  }

  await setTotpOkCookie(user.id)
  await audit({ actorUserId: user.id, action: 'admin.totp_ok', entity: 'user', entityId: user.id, ip: await clientIp() })
  redirect('/admin')
}

// Ação sensível (reembolso, recuperação de conta) exige código TOTP DIGITADO
// na hora — o cookie de 12h do portão não basta.
async function requireFreshTotp(formData: FormData, user: { id: string; totpSecret: string | null }): Promise<string | null> {
  if (!user.totpSecret) return 'Cadastre a 2FA (TOTP) antes de executar esta ação.'
  if (!(await rateLimit(`totp-fresh:${user.id}`, 5, 60_000)))
    return 'Muitas tentativas de código. Aguarde um minuto.'
  const code = str(formData, 'totp')
  if (!/^\d{6}$/.test(code)) return 'Digite o código de 6 dígitos do autenticador para confirmar.'
  if (!verifyTotp(openTotpSecret(user.totpSecret), code)) {
    await audit({ actorUserId: user.id, action: 'admin.totp_fresh_failed', entity: 'user', entityId: user.id, ip: await clientIp() })
    return 'Código 2FA inválido.'
  }
  return null
}

// ===== pedidos =====

// Reembolso REAL: chama a API do provedor (lib/refunds) — nunca só o banco.
// Exige ADMIN + código TOTP digitado na hora + motivo.
export async function refundOrderAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const id = str(formData, 'id')
  const path = `/admin/pedidos/${id}`
  const reason = reasonOrBack(formData, path)
  const totpError = await requireFreshTotp(formData, staff)
  if (totpError) back(path, { erro: totpError })
  const order = await db.order.findUnique({ where: { id } })
  if (!order) back('/admin/pedidos', { erro: 'Pedido não encontrado.' })

  const result = await requestRefund(id, staff.id, reason)
  if (result.status === 'REFUNDED')
    back(path, { ok: 'Reembolso confirmado pelo provedor. Licença suspensa e comissão cancelada.' })
  if (result.status === 'REFUND_PENDING')
    back(path, { ok: 'Reembolso solicitado ao provedor. O webhook confirma a conclusão — acompanhe o status do pedido.' })
  back(path, { erro: `Reembolso falhou: ${result.error ?? 'erro no provedor'}. Corrija e tente de novo.` })
}

export async function reprocessPaymentEventAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const backPath = str(formData, 'back') || '/admin'
  const rec = await db.paymentEvent.findUnique({ where: { id }, include: { payment: true } })
  if (!rec) back(backPath, { erro: 'Evento não encontrado.' })
  if (!rec.error) back(backPath, { erro: 'Evento sem erro registrado — nada a reprocessar.' })

  const raw = rec.payload as { providerPaymentId?: string } | null
  const providerPaymentId = rec.payment?.providerPaymentId ?? raw?.providerPaymentId ?? rec.eventId.split(':')[0]

  await db.paymentEvent.update({ where: { id: rec.id }, data: { error: null, processedAt: null } })
  await audit({
    actorUserId: staff.id,
    action: 'admin.payment_event_reprocess',
    entity: 'paymentEvent',
    entityId: rec.id,
    before: { error: rec.error },
    ip,
  })
  try {
    await processPaymentEvent(rec.provider, {
      eventId: rec.eventId,
      type: rec.type as 'payment.approved' | 'payment.declined' | 'payment.refunded' | 'payment.chargeback' | 'unknown',
      providerPaymentId,
      raw: rec.payload,
    })
  } catch (err) {
    back(backPath, { erro: `Reprocessamento falhou: ${err instanceof Error ? err.message : 'erro desconhecido'}` })
  }
  back(backPath, { ok: 'Evento reprocessado.' })
}

// ===== licenças =====

const LICENSE_TRANSITIONS = {
  SUSPENDED: { event: 'ADMIN_SUSPENDED', ok: 'Licença suspensa.' },
  ACTIVE: { event: 'ADMIN_REACTIVATED', ok: 'Licença reativada.' },
  REVOKED: { event: 'ADMIN_REVOKED', ok: 'Licença revogada.' },
  BLOCKED: { event: 'ADMIN_BLOCKED', ok: 'Licença bloqueada.' },
} as const

export async function setLicenseStatusAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/licencas/${id}`
  const to = str(formData, 'to') as keyof typeof LICENSE_TRANSITIONS
  const transition = LICENSE_TRANSITIONS[to]
  if (!transition) back(path, { erro: 'Transição inválida.' })
  const reason = reasonOrBack(formData, path)
  const license = await db.license.findUnique({ where: { id } })
  if (!license) back('/admin/licencas', { erro: 'Licença não encontrada.' })

  // reativar licença que nunca ativou volta para PENDING_ACTIVATION
  const target = to === 'ACTIVE' && !license.activatedAt ? 'PENDING_ACTIVATION' : to
  await db.$transaction(async (tx) => {
    await tx.license.update({ where: { id }, data: { status: target } })
    await tx.licenseEvent.create({
      data: { licenseId: id, type: transition.event, actorUserId: staff.id, meta: { reason } },
    })
    await audit(
      {
        actorUserId: staff.id,
        action: `admin.license_${to.toLowerCase()}`,
        entity: 'license',
        entityId: id,
        before: { status: license.status },
        after: { status: target },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: transition.ok })
}

export async function extendLicenseAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/licencas/${id}`
  const days = intOr(formData, 'days')
  if (!days || days < 1 || days > 3650) back(path, { erro: 'Quantidade de dias inválida (1 a 3650).' })
  const reason = reasonOrBack(formData, path)
  const license = await db.license.findUnique({ where: { id } })
  if (!license) back('/admin/licencas', { erro: 'Licença não encontrada.' })
  if (!license.expiresAt)
    back(path, { erro: 'Licença sem data de expiração (vitalícia ou aguardando ativação) — nada a estender.' })

  const base = license.expiresAt > new Date() ? license.expiresAt : new Date()
  const expiresAt = new Date(base.getTime() + days * 86400_000)
  const status = license.status === 'EXPIRED' && expiresAt > new Date() ? 'ACTIVE' : license.status
  await db.$transaction(async (tx) => {
    await tx.license.update({ where: { id }, data: { expiresAt, status } })
    await tx.licenseEvent.create({
      data: { licenseId: id, type: 'ADMIN_EXTENDED', actorUserId: staff.id, meta: { days, newExpiresAt: expiresAt, reason } },
    })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.license_extend',
        entity: 'license',
        entityId: id,
        before: { expiresAt: license.expiresAt, status: license.status },
        after: { expiresAt, status },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: `+${days} dias aplicados à licença.` })
}

export async function setDeviceLimitAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/licencas/${id}`
  const limit = intOr(formData, 'deviceLimit')
  if (!limit || limit < 1 || limit > 50) back(path, { erro: 'Limite de dispositivos inválido (1 a 50).' })
  const reason = reasonOrBack(formData, path)
  const license = await db.license.findUnique({ where: { id } })
  if (!license) back('/admin/licencas', { erro: 'Licença não encontrada.' })

  await db.$transaction(async (tx) => {
    await tx.license.update({ where: { id }, data: { deviceLimit: limit } })
    await tx.licenseEvent.create({
      data: { licenseId: id, type: 'ADMIN_DEVICE_LIMIT', actorUserId: staff.id, meta: { deviceLimit: limit, reason } },
    })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.license_device_limit',
        entity: 'license',
        entityId: id,
        before: { deviceLimit: license.deviceLimit },
        after: { deviceLimit: limit },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: `Limite de dispositivos alterado para ${limit}.` })
}

export async function unlinkDeviceAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const deviceId = str(formData, 'deviceId')
  const device = await db.licenseDevice.findUnique({ where: { id: deviceId } })
  if (!device) back('/admin/licencas', { erro: 'Dispositivo não encontrado.' })
  const path = `/admin/licencas/${device.licenseId}`
  const reason = reasonOrBack(formData, path)

  // exceção manual de suporte — HWID nunca bruto, nem em log
  await db.$transaction(async (tx) => {
    await tx.licenseDevice.delete({ where: { id: deviceId } })
    await tx.licenseEvent.create({
      data: { licenseId: device.licenseId, type: 'DEVICE_UNLINKED', actorUserId: staff.id, meta: { hwidMasked: maskHwid(device.hwid), reason } },
    })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.device_unlink',
        entity: 'license',
        entityId: device.licenseId,
        before: { deviceId, hwidMasked: maskHwid(device.hwid), name: device.name },
        after: { deviceId: null, unlinked: true },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: 'Vínculo de instalação resetado. A vaga foi liberada.' })
}

export interface GrantLicenseState {
  error: string | null
  plainKey?: string | null
  licenseId?: string
  extended?: boolean
}

export async function grantLicenseAction(_prev: GrantLicenseState, formData: FormData): Promise<GrantLicenseState> {
  const staff = await requireStaff('ADMIN')
  const email = str(formData, 'email').toLowerCase()
  const planId = str(formData, 'planId')
  const reason = str(formData, 'reason')
  if (reason.length < 4) return { error: 'Motivo obrigatório (mínimo 4 caracteres).' }
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return { error: 'Nenhum usuário com este e-mail.' }
  const plan = await db.plan.findUnique({ where: { id: planId } })
  if (!plan || !plan.active) return { error: 'Plano inválido ou inativo.' }

  const ip = await clientIp()
  const result = await db.$transaction(async (tx) => {
    const r = await issueOrExtendLicense(tx, { userId: user.id, plan, actorUserId: staff.id })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.license_grant',
        entity: 'license',
        entityId: r.license.id,
        after: { userId: user.id, planId: plan.id, extended: r.extended },
        reason,
        ip,
      },
      tx,
    )
    return r
  })
  revalidatePath('/admin/licencas')
  return { error: null, plainKey: result.plainKey, licenseId: result.license.id, extended: result.extended }
}

// ===== usuários =====

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/usuarios/${id}`
  const to = str(formData, 'to')
  if (to !== 'ACTIVE' && to !== 'SUSPENDED') back(path, { erro: 'Estado inválido.' })
  const reason = reasonOrBack(formData, path)
  const user = await db.user.findUnique({ where: { id } })
  if (!user) back('/admin/usuarios', { erro: 'Usuário não encontrado.' })
  if (user.id === staff.id) back(path, { erro: 'Não é possível alterar o estado da própria conta.' })

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status: to } })
    if (to === 'SUSPENDED')
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(
      {
        actorUserId: staff.id,
        action: to === 'SUSPENDED' ? 'admin.user_suspend' : 'admin.user_reactivate',
        entity: 'user',
        entityId: id,
        before: { status: user.status },
        after: { status: to },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: to === 'SUSPENDED' ? 'Conta suspensa e sessões encerradas.' : 'Conta reativada.' })
}

const STAFF_ROLES = ['NONE', 'SUPPORT', 'ADMIN', 'SUPERADMIN'] as const

export async function setStaffRoleAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('SUPERADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/usuarios/${id}`
  const role = str(formData, 'role') as (typeof STAFF_ROLES)[number]
  if (!STAFF_ROLES.includes(role)) back(path, { erro: 'Papel inválido.' })
  const reason = reasonOrBack(formData, path)
  const user = await db.user.findUnique({ where: { id } })
  if (!user) back('/admin/usuarios', { erro: 'Usuário não encontrado.' })
  if (user.id === staff.id) back(path, { erro: 'Não é possível alterar o próprio papel.' })

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { staffRole: role } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.staff_role_change',
        entity: 'user',
        entityId: id,
        before: { staffRole: user.staffRole },
        after: { staffRole: role },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: `Papel alterado para ${role}.` })
}

export interface AdminRecoveryState {
  error: string | null
  resetUrl?: string
}

// Recuperação administrativa (usuário esqueceu senha E respostas): gera link
// de redefinição de uso único para entregar pelo canal de suporte. Perguntas
// antigas são descartadas (nunca exibidas — só existem como hash) e códigos de
// recuperação anteriores deixam de valer. Exige TOTP digitado + motivo.
export async function adminRecoverAccountAction(
  _prev: AdminRecoveryState,
  formData: FormData,
): Promise<AdminRecoveryState> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const reason = str(formData, 'reason')
  if (reason.length < 4) return { error: 'Motivo obrigatório (mínimo 4 caracteres).' }
  const totpError = await requireFreshTotp(formData, staff)
  if (totpError) return { error: totpError }
  const user = await db.user.findUnique({ where: { id } })
  if (!user) return { error: 'Usuário não encontrado.' }
  if (user.staffRole !== 'NONE' && staff.staffRole !== 'SUPERADMIN')
    return { error: 'Recuperar conta de staff exige SUPERADMIN.' }

  const token = randomToken(24)
  await db.$transaction(async (tx) => {
    await tx.emailToken.create({
      data: {
        tokenHash: sha256(token),
        purpose: 'RESET_PASSWORD',
        userId: user.id,
        expiresAt: new Date(Date.now() + 2 * 3600_000),
      },
    })
    await tx.securityQuestion.deleteMany({ where: { userId: user.id } })
    await tx.recoveryCode.updateMany({
      where: { userId: user.id, kind: 'ACCOUNT', usedAt: null },
      data: { usedAt: new Date() },
    })
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(
      { actorUserId: staff.id, action: 'admin.account_recovery', entity: 'user', entityId: user.id, reason, ip },
      tx,
    )
  })
  return { error: null, resetUrl: `${env.APP_URL}/recuperar/${token}` }
}

export async function forceLogoutAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/usuarios/${id}`
  const user = await db.user.findUnique({ where: { id } })
  if (!user) back('/admin/usuarios', { erro: 'Usuário não encontrado.' })
  await revokeAllSessions(id)
  await audit({ actorUserId: staff.id, action: 'admin.force_logout', entity: 'user', entityId: id, ip })
  back(path, { ok: 'Todas as sessões do usuário foram encerradas.' })
}

// ===== planos =====

export async function upsertPlanAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const listPath = '/admin/planos'
  const formPath = id ? `${listPath}/${id}` : `${listPath}/novo`

  const name = str(formData, 'name')
  if (!name) back(formPath, { erro: 'Nome do plano é obrigatório.' })
  const durationDays = intOr(formData, 'durationDays') // vazio = vitalício
  const deviceLimit = intOr(formData, 'deviceLimit', 1) ?? 1
  const sortOrder = intOr(formData, 'sortOrder', 0) ?? 0
  const featured = formData.get('featured') === 'on'
  const active = formData.get('active') === 'on'
  const priceCents = parseMoneyCents(str(formData, 'price'))
  if (priceCents === null || priceCents <= 0) back(formPath, { erro: 'Preço inválido. Use o formato 199,90.' })
  const compareAtCents = parseMoneyCents(str(formData, 'compareAt'))
  const creditCents = parseMoneyCents(str(formData, 'creditCents'))
  const featureLines = str(formData, 'features')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  // pack de créditos guarda { creditCents }; plano normal guarda a lista de benefícios
  const features: Prisma.InputJsonValue = creditCents ? { creditCents } : featureLines

  if (id) {
    const before = await db.plan.findUnique({ where: { id }, include: { prices: { where: { currency: 'BRL' } } } })
    if (!before) back(listPath, { erro: 'Plano não encontrado.' })
    await db.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: { name, durationDays, deviceLimit, sortOrder, featured, active, features },
      })
      await tx.price.upsert({
        where: { planId_currency: { planId: id, currency: 'BRL' } },
        create: { planId: id, currency: 'BRL', amountCents: priceCents, compareAtCents },
        update: { amountCents: priceCents, compareAtCents, active: true },
      })
      await audit(
        {
          actorUserId: staff.id,
          action: 'admin.plan_update',
          entity: 'plan',
          entityId: id,
          before: {
            name: before.name,
            durationDays: before.durationDays,
            deviceLimit: before.deviceLimit,
            featured: before.featured,
            active: before.active,
            features: before.features,
            priceCents: before.prices[0]?.amountCents ?? null,
            compareAtCents: before.prices[0]?.compareAtCents ?? null,
          },
          after: { name, durationDays, deviceLimit, featured, active, features, priceCents, compareAtCents },
          ip,
        },
        tx,
      )
    })
    back(formPath, { ok: 'Plano salvo.' })
  }

  const slug = str(formData, 'slug')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const productId = str(formData, 'productId')
  if (!slug || !productId) back(formPath, { erro: 'Slug e produto são obrigatórios para criar um plano.' })
  let createdId = ''
  try {
    const created = await db.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: { productId, slug, name, durationDays, deviceLimit, sortOrder, featured, active, features },
      })
      await tx.price.create({ data: { planId: plan.id, currency: 'BRL', amountCents: priceCents, compareAtCents } })
      await audit(
        {
          actorUserId: staff.id,
          action: 'admin.plan_create',
          entity: 'plan',
          entityId: plan.id,
          after: { slug, name, durationDays, deviceLimit, featured, active, features, priceCents },
          ip,
        },
        tx,
      )
      return plan
    })
    createdId = created.id
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') back(formPath, { erro: 'Já existe um plano com este slug.' })
    throw err
  }
  back(`${listPath}/${createdId}`, { ok: 'Plano criado.' })
}

// ===== cupons =====

export async function upsertCouponAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const listPath = '/admin/cupons'
  const formPath = id ? `${listPath}/${id}` : `${listPath}/novo`

  const code = str(formData, 'code').toUpperCase().replace(/\s+/g, '')
  if (code.length < 3) back(formPath, { erro: 'Código do cupom precisa de pelo menos 3 caracteres.' })
  const type = str(formData, 'type') === 'FIXED' ? ('FIXED' as const) : ('PERCENT' as const)
  let value: number | null = null
  if (type === 'PERCENT') {
    const pct = Number(str(formData, 'value').replace(',', '.'))
    if (Number.isFinite(pct) && pct > 0 && pct <= 100) value = Math.round(pct * 100)
  } else {
    const cents = parseMoneyCents(str(formData, 'value'))
    if (cents !== null && cents > 0) value = cents
  }
  if (value === null)
    back(formPath, { erro: type === 'PERCENT' ? 'Percentual inválido (1 a 100).' : 'Valor inválido. Use o formato 10,00.' })

  const maxRedemptions = intOr(formData, 'maxRedemptions')
  const perUserLimit = intOr(formData, 'perUserLimit', 1) ?? 1
  const startsAt = dateOr(formData, 'startsAt')
  const endsAt = dateOr(formData, 'endsAt')
  const minAmountCents = parseMoneyCents(str(formData, 'minAmount'))
  const planIds = formData.getAll('planIds').map(String).filter(Boolean)
  const active = formData.get('active') === 'on'

  const data = {
    code,
    type,
    value,
    maxRedemptions,
    perUserLimit,
    startsAt,
    endsAt,
    minAmountCents,
    planIds: planIds.length ? (planIds as Prisma.InputJsonValue) : Prisma.JsonNull,
    active,
  }

  try {
    if (id) {
      const before = await db.coupon.findUnique({ where: { id } })
      if (!before) back(listPath, { erro: 'Cupom não encontrado.' })
      await db.$transaction(async (tx) => {
        await tx.coupon.update({ where: { id }, data })
        await audit(
          {
            actorUserId: staff.id,
            action: 'admin.coupon_update',
            entity: 'coupon',
            entityId: id,
            before: {
              code: before.code,
              type: before.type,
              value: before.value,
              maxRedemptions: before.maxRedemptions,
              perUserLimit: before.perUserLimit,
              startsAt: before.startsAt,
              endsAt: before.endsAt,
              minAmountCents: before.minAmountCents,
              planIds: before.planIds,
              active: before.active,
            },
            after: { ...data, planIds: planIds.length ? planIds : null },
            ip,
          },
          tx,
        )
      })
    } else {
      await db.$transaction(async (tx) => {
        const coupon = await tx.coupon.create({ data })
        await audit(
          {
            actorUserId: staff.id,
            action: 'admin.coupon_create',
            entity: 'coupon',
            entityId: coupon.id,
            after: { ...data, planIds: planIds.length ? planIds : null },
            ip,
          },
          tx,
        )
      })
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') back(formPath, { erro: 'Já existe um cupom com este código.' })
    throw err
  }
  back(listPath, { ok: id ? 'Cupom salvo.' : 'Cupom criado.' })
}

// ===== afiliados =====

export async function setAffiliateStatusAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/afiliados/${id}`
  const to = str(formData, 'to')
  if (to !== 'APPROVED' && to !== 'SUSPENDED') back(path, { erro: 'Estado inválido.' })
  const reason = reasonOrBack(formData, path)
  const affiliate = await db.affiliate.findUnique({ where: { id } })
  if (!affiliate) back('/admin/afiliados', { erro: 'Afiliado não encontrado.' })

  await db.$transaction(async (tx) => {
    await tx.affiliate.update({ where: { id }, data: { status: to } })
    await audit(
      {
        actorUserId: staff.id,
        action: to === 'APPROVED' ? 'admin.affiliate_approve' : 'admin.affiliate_suspend',
        entity: 'affiliate',
        entityId: id,
        before: { status: affiliate.status },
        after: { status: to },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: to === 'APPROVED' ? 'Inscrição aprovada.' : 'Afiliado suspenso.' })
}

export async function setAffiliateCommissionAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/afiliados/${id}`
  const bps = intOr(formData, 'commissionBps')
  if (bps === null || bps < 0 || bps > 5000) back(path, { erro: 'Comissão inválida (0 a 5000 bps = 0% a 50%).' })
  const reason = reasonOrBack(formData, path)
  const affiliate = await db.affiliate.findUnique({ where: { id } })
  if (!affiliate) back('/admin/afiliados', { erro: 'Afiliado não encontrado.' })

  await db.$transaction(async (tx) => {
    await tx.affiliate.update({ where: { id }, data: { commissionBps: bps } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.affiliate_commission',
        entity: 'affiliate',
        entityId: id,
        before: { commissionBps: affiliate.commissionBps },
        after: { commissionBps: bps },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: `Comissão alterada para ${(bps / 100).toFixed(2)}%.` })
}

export async function approvePayoutAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = '/admin/afiliados/saques'
  const payout = await db.payoutRequest.findUnique({ where: { id } })
  if (!payout) back(path, { erro: 'Saque não encontrado.' })
  if (payout.status !== 'REQUESTED') back(path, { erro: 'Só saque SOLICITADO pode ser aprovado.' })

  await db.$transaction(async (tx) => {
    await tx.payoutRequest.update({ where: { id }, data: { status: 'APPROVED' } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.payout_approve',
        entity: 'payoutRequest',
        entityId: id,
        before: { status: payout.status },
        after: { status: 'APPROVED' },
        ip,
      },
      tx,
    )
  })
  back(path, { ok: 'Saque aprovado. Depois do PIX, marque como pago.' })
}

export async function markPayoutPaidAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = '/admin/afiliados/saques'
  const payout = await db.payoutRequest.findUnique({ where: { id } })
  if (!payout) back(path, { erro: 'Saque não encontrado.' })
  if (payout.status !== 'APPROVED') back(path, { erro: 'Só saque APROVADO pode ser marcado como pago.' })

  await db.$transaction(async (tx) => {
    await tx.payoutRequest.update({ where: { id }, data: { status: 'PAID', processedAt: new Date() } })
    // marca as comissões APPROVED mais antigas como PAID até cobrir o valor do saque
    const commissions = await tx.commission.findMany({
      where: { affiliateId: payout.affiliateId, status: 'APPROVED' },
      orderBy: { createdAt: 'asc' },
    })
    let remaining = payout.amountCents
    const paidIds: string[] = []
    for (const c of commissions) {
      if (c.amountCents > remaining) break
      paidIds.push(c.id)
      remaining -= c.amountCents
    }
    if (paidIds.length)
      await tx.commission.updateMany({ where: { id: { in: paidIds } }, data: { status: 'PAID', paidAt: new Date() } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.payout_paid',
        entity: 'payoutRequest',
        entityId: id,
        before: { status: payout.status },
        after: { status: 'PAID', amountCents: payout.amountCents, commissionsPaid: paidIds.length },
        ip,
      },
      tx,
    )
  })
  back(path, { ok: 'Saque marcado como pago e comissões correspondentes quitadas.' })
}

export async function rejectPayoutAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = '/admin/afiliados/saques'
  const reason = reasonOrBack(formData, path)
  const payout = await db.payoutRequest.findUnique({ where: { id } })
  if (!payout) back(path, { erro: 'Saque não encontrado.' })
  if (payout.status === 'PAID') back(path, { erro: 'Saque já pago não pode ser rejeitado.' })

  await db.$transaction(async (tx) => {
    await tx.payoutRequest.update({ where: { id }, data: { status: 'REJECTED', adminNote: reason, processedAt: new Date() } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.payout_reject',
        entity: 'payoutRequest',
        entityId: id,
        before: { status: payout.status },
        after: { status: 'REJECTED' },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: 'Saque rejeitado.' })
}

// ===== revendedores =====

export async function setResellerStatusAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/revendedores/${id}`
  const to = str(formData, 'to')
  if (to !== 'APPROVED' && to !== 'SUSPENDED') back(path, { erro: 'Estado inválido.' })
  const reason = reasonOrBack(formData, path)
  const reseller = await db.reseller.findUnique({ where: { id } })
  if (!reseller) back('/admin/revendedores', { erro: 'Revendedor não encontrado.' })

  await db.$transaction(async (tx) => {
    await tx.reseller.update({ where: { id }, data: { status: to } })
    await audit(
      {
        actorUserId: staff.id,
        action: to === 'APPROVED' ? 'admin.reseller_approve' : 'admin.reseller_suspend',
        entity: 'reseller',
        entityId: id,
        before: { status: reseller.status },
        after: { status: to },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: to === 'APPROVED' ? 'Revendedor aprovado.' : 'Revendedor suspenso.' })
}

export async function updateResellerAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/revendedores/${id}`
  const tier = intOr(formData, 'tier')
  const discountBps = intOr(formData, 'discountBps')
  const dailyIssueLimit = intOr(formData, 'dailyIssueLimit')
  const monthlyIssueLimit = intOr(formData, 'monthlyIssueLimit')
  if (
    tier === null || tier < 1 || tier > 10 ||
    discountBps === null || discountBps < 0 || discountBps > 9000 ||
    dailyIssueLimit === null || dailyIssueLimit < 0 ||
    monthlyIssueLimit === null || monthlyIssueLimit < 0
  )
    back(path, { erro: 'Valores inválidos. Tier 1 a 10, desconto 0 a 9000 bps, limites não negativos.' })
  const reason = reasonOrBack(formData, path)
  const reseller = await db.reseller.findUnique({ where: { id } })
  if (!reseller) back('/admin/revendedores', { erro: 'Revendedor não encontrado.' })

  await db.$transaction(async (tx) => {
    await tx.reseller.update({ where: { id }, data: { tier, discountBps, dailyIssueLimit, monthlyIssueLimit } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.reseller_update',
        entity: 'reseller',
        entityId: id,
        before: {
          tier: reseller.tier,
          discountBps: reseller.discountBps,
          dailyIssueLimit: reseller.dailyIssueLimit,
          monthlyIssueLimit: reseller.monthlyIssueLimit,
        },
        after: { tier, discountBps, dailyIssueLimit, monthlyIssueLimit },
        reason,
        ip,
      },
      tx,
    )
  })
  back(path, { ok: 'Dados do revendedor atualizados.' })
}

export async function grantResellerCreditsAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const id = str(formData, 'id')
  const path = `/admin/revendedores/${id}`
  const cents = parseMoneyCents(str(formData, 'amount'))
  if (cents === null || cents <= 0) back(path, { erro: 'Valor inválido. Use o formato 100,00.' })
  const reason = reasonOrBack(formData, path)
  const reseller = await db.reseller.findUnique({ where: { id } })
  if (!reseller) back('/admin/revendedores', { erro: 'Revendedor não encontrado.' })

  await addCredits(id, cents, { type: 'ADMIN_ADJUST', note: reason, actorUserId: staff.id })
  back(path, { ok: 'Créditos concedidos.' })
}

export async function debitResellerCreditsAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/revendedores/${id}`
  const cents = parseMoneyCents(str(formData, 'amount'))
  if (cents === null || cents <= 0) back(path, { erro: 'Valor inválido. Use o formato 100,00.' })
  const reason = reasonOrBack(formData, path)

  let failed: string | null = null
  try {
    await db.$transaction(async (tx) => {
      // débito condicionado ao saldo — mesma técnica da lib, sem saldo negativo
      const debited = await tx.reseller.updateMany({
        where: { id, creditBalanceCents: { gte: cents } },
        data: { creditBalanceCents: { decrement: cents } },
      })
      if (debited.count === 0) throw new Error('SALDO_INSUFICIENTE')
      const after = await tx.reseller.findUniqueOrThrow({ where: { id } })
      await tx.resellerLedger.create({
        data: { resellerId: id, type: 'ADMIN_ADJUST', deltaCents: -cents, balanceAfter: after.creditBalanceCents, note: reason },
      })
      await audit(
        {
          actorUserId: staff.id,
          action: 'admin.reseller_credit_debit',
          entity: 'reseller',
          entityId: id,
          before: { creditBalanceCents: after.creditBalanceCents + cents },
          after: { creditBalanceCents: after.creditBalanceCents },
          reason,
          ip,
        },
        tx,
      )
    })
  } catch (err) {
    failed = err instanceof Error && err.message === 'SALDO_INSUFICIENTE'
      ? 'Saldo insuficiente para o débito.'
      : 'Não foi possível debitar. Tente de novo.'
  }
  if (failed) back(path, { erro: failed })
  back(path, { ok: 'Créditos debitados.' })
}

// ===== versões do app =====

export async function upsertAppVersionAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = '/admin/versoes'
  const version = str(formData, 'version')
  const channel = str(formData, 'channel') || 'stable'
  const notes = str(formData, 'notes')
  const fileName = str(formData, 'fileName')
  const checksum = str(formData, 'checksum').replace(/^sha256:/i, '').toLowerCase()
  const volta = id ? `${path}/${id}` : path
  if (!version || !fileName || !checksum)
    back(volta, { erro: 'Versão, arquivo no volume e checksum são obrigatórios.' })

  // o arquivo precisa existir no volume E bater com o SHA-256 informado — é a
  // única garantia de que o cliente baixa exatamente o que foi publicado
  const caminho = installerPath(fileName)
  if (!caminho)
    back(volta, { erro: 'Nome de arquivo inválido — use só letras, números, ponto, hífen e sublinhado.' })
  let sizeBytes: bigint
  let real: string
  try {
    sizeBytes = BigInt((await stat(caminho)).size)
    real = await sha256File(caminho)
  } catch {
    back(volta, { erro: `Arquivo ${fileName} não encontrado no volume. Envie o instalador antes de salvar a versão.` })
  }
  if (real !== checksum)
    back(volta, { erro: `Checksum não confere. SHA-256 do arquivo no servidor: ${real}` })

  try {
    if (id) {
      const before = await db.appVersion.findUnique({ where: { id } })
      if (!before) back(path, { erro: 'Versão não encontrada.' })
      await db.$transaction(async (tx) => {
        await tx.appVersion.update({
          where: { id },
          data: { version, channel, notes, fileName, checksum, sizeBytes },
        })
        await audit(
          {
            actorUserId: staff.id,
            action: 'admin.app_version_update',
            entity: 'appVersion',
            entityId: id,
            before: {
              version: before.version,
              channel: before.channel,
              fileName: before.fileName,
              checksum: before.checksum,
            },
            after: { version, channel, fileName, checksum },
            ip,
          },
          tx,
        )
      })
    } else {
      await db.$transaction(async (tx) => {
        const created = await tx.appVersion.create({
          data: { version, channel, notes, fileName, checksum, sizeBytes, active: false },
        })
        await audit(
          {
            actorUserId: staff.id,
            action: 'admin.app_version_create',
            entity: 'appVersion',
            entityId: created.id,
            after: { version, channel, fileName, checksum },
            ip,
          },
          tx,
        )
      })
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002')
      back(id ? `${path}/${id}` : path, { erro: 'Já existe uma versão com este número.' })
    throw err
  }
  back(path, { ok: id ? 'Versão salva.' : 'Versão criada. Publique quando estiver pronta.' })
}

export async function publishAppVersionAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const publish = str(formData, 'to') === 'publish'
  const path = '/admin/versoes'
  const version = await db.appVersion.findUnique({ where: { id } })
  if (!version) back(path, { erro: 'Versão não encontrada.' })

  await db.$transaction(async (tx) => {
    await tx.appVersion.update({
      where: { id },
      data: { publishedAt: publish ? new Date() : null, active: publish },
    })
    await audit(
      {
        actorUserId: staff.id,
        action: publish ? 'admin.app_version_publish' : 'admin.app_version_unpublish',
        entity: 'appVersion',
        entityId: id,
        before: { publishedAt: version.publishedAt, active: version.active },
        after: { published: publish },
        ip,
      },
      tx,
    )
  })
  back(path, { ok: publish ? `Versão ${version.version} publicada.` : `Versão ${version.version} despublicada.` })
}

// ===== fila (jobs) =====

export async function retryJobAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const id = str(formData, 'id')
  const path = '/admin/jobs'
  const job = await db.job.findUnique({ where: { id } })
  if (!job) back(path, { erro: 'Job não encontrado.' })
  if (job.status !== 'DEAD') back(path, { erro: 'Só job DEAD pode ser reenfileirado.' })

  await db.job.update({
    where: { id },
    data: { status: 'PENDING', attempts: 0, runAt: new Date(), lockedAt: null, lockedBy: null, leaseUntil: null },
  })
  await audit({
    actorUserId: staff.id,
    action: 'admin.job_retry',
    entity: 'job',
    entityId: id,
    before: { status: 'DEAD', attempts: job.attempts, lastError: job.lastError?.slice(0, 300) ?? null },
    after: { status: 'PENDING' },
    ip: await clientIp(),
  })
  back(path, { ok: 'Job reenfileirado. O worker processa no próximo ciclo.' })
}

// ===== tickets =====

const TICKET_STATUSES = ['OPEN', 'AWAITING_SUPPORT', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const

export async function assignTicketAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('SUPPORT')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/tickets/${id}`
  const ticket = await db.supportTicket.findUnique({ where: { id } })
  if (!ticket) back('/admin/tickets', { erro: 'Ticket não encontrado.' })
  await db.supportTicket.update({ where: { id }, data: { assignedToUserId: staff.id } })
  await audit({
    actorUserId: staff.id,
    action: 'admin.ticket_assign',
    entity: 'supportTicket',
    entityId: id,
    before: { assignedToUserId: ticket.assignedToUserId },
    after: { assignedToUserId: staff.id },
    ip,
  })
  back(path, { ok: 'Ticket assumido.' })
}

export async function replyTicketAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('SUPPORT')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/tickets/${id}`
  const body = str(formData, 'body')
  if (body.length < 2) back(path, { erro: 'Escreva a resposta antes de enviar.' })
  const s = str(formData, 'status')
  const status = (TICKET_STATUSES as readonly string[]).includes(s)
    ? (s as (typeof TICKET_STATUSES)[number])
    : 'AWAITING_CUSTOMER'
  const ticket = await db.supportTicket.findUnique({ where: { id } })
  if (!ticket) back('/admin/tickets', { erro: 'Ticket não encontrado.' })

  await db.$transaction(async (tx) => {
    await tx.supportMessage.create({ data: { ticketId: id, authorUserId: staff.id, isStaff: true, body } })
    await tx.supportTicket.update({ where: { id }, data: { status } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.ticket_reply',
        entity: 'supportTicket',
        entityId: id,
        before: { status: ticket.status },
        after: { status },
        ip,
      },
      tx,
    )
  })
  back(path, { ok: 'Resposta enviada.' })
}

export async function setTicketStatusAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('SUPPORT')
  const ip = await clientIp()
  const id = str(formData, 'id')
  const path = `/admin/tickets/${id}`
  const s = str(formData, 'status')
  if (!(TICKET_STATUSES as readonly string[]).includes(s)) back(path, { erro: 'Status inválido.' })
  const status = s as (typeof TICKET_STATUSES)[number]
  const ticket = await db.supportTicket.findUnique({ where: { id } })
  if (!ticket) back('/admin/tickets', { erro: 'Ticket não encontrado.' })

  await db.supportTicket.update({ where: { id }, data: { status } })
  await audit({
    actorUserId: staff.id,
    action: 'admin.ticket_status',
    entity: 'supportTicket',
    entityId: id,
    before: { status: ticket.status },
    after: { status },
    ip,
  })
  back(path, { ok: `Status alterado para ${status}.` })
}

// ===== configurações =====

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const path = '/admin/config'
  const refundDays = intOr(formData, 'refund_window_days')
  const cooldownDays = intOr(formData, 'device_reset_cooldown_days')
  const payoutMin = parseMoneyCents(str(formData, 'payout_min'))
  if (refundDays === null || refundDays < 0 || cooldownDays === null || cooldownDays < 0 || payoutMin === null)
    back(path, { erro: 'Valores numéricos inválidos. Confira dias e valor mínimo de saque.' })

  const minVersion = str(formData, 'min_desktop_version')
  if (minVersion && !/^\d+\.\d+\.\d+$/.test(minVersion))
    back(path, { erro: 'Versão mínima do app inválida. Use o formato 1.2.0 (ou deixe vazio).' })

  const values: Record<string, unknown> = {
    refund_window_days: refundDays,
    payout_min_cents: payoutMin,
    device_reset_cooldown_days: cooldownDays,
    discord_invite: str(formData, 'discord_invite'),
    discord_role_cliente: str(formData, 'discord_role_cliente'),
    maintenance_mode: formData.get('maintenance_mode') === 'on',
    // portões operacionais (lib/gates): ausência = ligado; aqui gravamos explícito.
    // URL do instalador NÃO mora aqui: versão+URL+checksum andam juntos em /admin/versoes.
    checkout_enabled: formData.get('checkout_enabled') === 'on',
    activation_enabled: formData.get('activation_enabled') === 'on',
    min_desktop_version: minVersion,
    support_url: str(formData, 'support_url'),
  }
  const keys = Object.keys(values)
  const beforeRows = await db.setting.findMany({ where: { key: { in: keys } } })
  const before = Object.fromEntries(beforeRows.map((s) => [s.key, s.value]))

  await db.$transaction(async (tx) => {
    for (const [k, v] of Object.entries(values)) await setSetting(k, v, tx)
    await audit(
      { actorUserId: staff.id, action: 'admin.settings_update', entity: 'setting', before, after: values, ip },
      tx,
    )
  })
  back(path, { ok: 'Configurações salvas.' })
}

export async function upsertFlagAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const path = '/admin/config'
  const key = str(formData, 'key').toLowerCase()
  if (!/^[a-z0-9_.-]{2,64}$/.test(key))
    back(path, { erro: 'Chave da flag inválida. Use letras minúsculas, números, ponto, hífen ou sublinhado.' })
  const enabled = formData.get('enabled') === 'on'
  const description = str(formData, 'description') || null
  const before = await db.featureFlag.findUnique({ where: { key } })

  await db.$transaction(async (tx) => {
    await tx.featureFlag.upsert({
      where: { key },
      create: { key, enabled, description },
      update: { enabled, description },
    })
    await audit(
      {
        actorUserId: staff.id,
        action: before ? 'admin.flag_update' : 'admin.flag_create',
        entity: 'featureFlag',
        entityId: key,
        before: before ? { enabled: before.enabled, description: before.description } : undefined,
        after: { enabled, description },
        ip,
      },
      tx,
    )
  })
  back(path, { ok: `Flag ${key} salva.` })
}

export async function deleteFlagAction(formData: FormData): Promise<void> {
  const staff = await requireStaff('ADMIN')
  const ip = await clientIp()
  const path = '/admin/config'
  const key = str(formData, 'key')
  const before = await db.featureFlag.findUnique({ where: { key } })
  if (!before) back(path, { erro: 'Flag não encontrada.' })

  await db.$transaction(async (tx) => {
    await tx.featureFlag.delete({ where: { key } })
    await audit(
      {
        actorUserId: staff.id,
        action: 'admin.flag_delete',
        entity: 'featureFlag',
        entityId: key,
        before: { enabled: before.enabled, description: before.description },
        ip,
      },
      tx,
    )
  })
  back(path, { ok: `Flag ${key} removida.` })
}

// ===== 2FA da própria conta staff =====

export interface TotpSetupState {
  error: string | null
  secret?: string
  secretBase32?: string
  otpauth?: string
  qr?: QrPath
  done?: boolean
  removed?: boolean
  // códigos de recuperação da 2FA — exibidos UMA vez, banco guarda só hash
  recoveryCodes?: string[]
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem 0/O/1/I

function generateTotpRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10)
    let out = ''
    for (let i = 0; i < 10; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
    return `${out.slice(0, 5)}-${out.slice(5)}`
  })
}

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// authenticator apps só aceitam base32; o banco guarda hex (formato do verifyTotp)
function base32Encode(buf: Buffer): string {
  let bits = 0
  let acc = 0
  let out = ''
  for (const byte of buf) {
    acc = (acc << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(acc >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32_ALPHABET[(acc << (5 - bits)) & 31]
  return out
}

// SUPPORT também: 2FA é obrigatória para TODO staff antes de acessar o painel.
export async function startTotpSetupAction(_prev: TotpSetupState, _formData: FormData): Promise<TotpSetupState> {
  const user = await requireStaff('SUPPORT')
  if (user.totpSecret) return { error: '2FA já está ativa nesta conta. Remova antes de gerar um novo segredo.' }
  const secret = generateTotpSecret()
  const secretBase32 = base32Encode(Buffer.from(secret, 'hex'))
  const label = encodeURIComponent(`${BRAND.name}:${user.email}`)
  const otpauth = `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(BRAND.name)}`
  return { error: null, secret, secretBase32, otpauth, qr: qrPath(otpauth) }
}

export async function confirmTotpAction(prev: TotpSetupState, formData: FormData): Promise<TotpSetupState> {
  const user = await requireStaff('SUPPORT')
  if (user.totpSecret) return { error: '2FA já está ativa nesta conta.' }
  const secret = str(formData, 'secret')
  const code = str(formData, 'code')
  if (!/^[0-9a-f]{40}$/.test(secret)) return { error: 'Configuração inválida. Gere um novo segredo.' }
  const keep = {
    secret,
    secretBase32: base32Encode(Buffer.from(secret, 'hex')),
    otpauth: prev.otpauth,
    qr: prev.qr,
  }
  if (!(await rateLimit(`totp-setup:${user.id}`, 5, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.', ...keep }
  if (!verifyTotp(secret, code))
    return { error: 'Código não confere. Confira o cadastro no aplicativo e tente de novo.', ...keep }

  // segredo cifrado em repouso + códigos de recuperação de uso único (só hash)
  const recoveryCodes = generateTotpRecoveryCodes()
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpSecret: sealTotpSecret(secret) } })
    await tx.recoveryCode.updateMany({
      where: { userId: user.id, kind: 'TOTP', usedAt: null },
      data: { usedAt: new Date() },
    })
    await tx.recoveryCode.createMany({
      data: recoveryCodes.map((c) => ({
        userId: user.id,
        kind: 'TOTP' as const,
        codeHash: sha256(c.replace(/[^A-Z0-9]/g, '')),
      })),
    })
    await audit({ actorUserId: user.id, action: 'admin.totp_enable', entity: 'user', entityId: user.id, ip: await clientIp() }, tx)
  })
  // NÃO setar o cookie de 2FA aqui: mutação de cookie re-renderiza a rota e
  // /admin/2fa redirecionaria ANTES de exibir os códigos de recuperação (que
  // aparecem UMA única vez). O portão pede o código na entrada seguinte.
  return { error: null, done: true, recoveryCodes }
}

export async function removeTotpAction(_prev: TotpSetupState, formData: FormData): Promise<TotpSetupState> {
  const user = await requireStaff('ADMIN')
  if (!user.totpSecret) return { error: '2FA não está ativa nesta conta.' }
  if (!(await rateLimit(`totp-remove:${user.id}`, 5, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }
  const password = String(formData.get('password') ?? '')
  if (!user.passwordHash) return { error: 'Conta sem senha local. Defina uma senha antes de remover a 2FA.' }
  if (!(await verifyPassword(password, user.passwordHash))) return { error: 'Senha incorreta.' }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpSecret: null } })
    await tx.recoveryCode.updateMany({
      where: { userId: user.id, kind: 'TOTP', usedAt: null },
      data: { usedAt: new Date() },
    })
    await audit({ actorUserId: user.id, action: 'admin.totp_disable', entity: 'user', entityId: user.id, ip: await clientIp() }, tx)
  })
  revalidatePath('/admin/config')
  // 2FA é obrigatória: o próximo acesso ao painel vai exigir novo cadastro
  return { error: null, removed: true }
}
