import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getGates } from '@/lib/gates'
import { activateLicense, findLicenseByKey, licenseStatusCheck, maskHwid } from '@/lib/licensing'
import { activateSchema, apiError, appOutdated, checkError, checkRate, clientIp, effectiveMinVersion, keyFingerprint, parseBody } from '../../_lib'

export async function POST(req: NextRequest) {
  const { data, res } = await parseBody(req, activateSchema)
  if (res) return res
  const rl = await checkRate(req, 'activate', data.key, 10)
  if (rl) return rl

  // gate operacional ANTES de tocar a licença — validate/heartbeat não são
  // bloqueados (cliente pagante não pode ser derrubado)
  const gates = await getGates()
  if (!gates.activationEnabled) {
    return apiError(
      503,
      'ERR_ACTIVATIONS_DISABLED',
      'Novas ativações estão temporariamente pausadas. Tente novamente em alguns minutos.',
    )
  }

  // pré-checagem: minAppVersion antes de vincular dispositivo
  const existing = await findLicenseByKey(data.key)
  const pre = licenseStatusCheck(existing)
  if (pre.code !== 'OK' || !existing) {
    if (pre.code === 'NOT_FOUND') {
      // alimenta o alerta de tentativas inválidas no admin — sem a chave, só fingerprint
      await db.auditLog
        .create({
          data: {
            action: 'api.activate_invalid_key',
            entity: 'license',
            after: { keyFingerprint: keyFingerprint(data.key) },
            ip: clientIp(req),
          },
        })
        .catch(() => {})
    }
    return checkError(pre.code as Exclude<typeof pre.code, 'OK'>)
  }
  const outdated = appOutdated(effectiveMinVersion(existing.minAppVersion, gates.minDesktopVersion), data.appVersion)
  if (outdated) return outdated
  const newDevice = !existing.devices.some((d) => d.hwid === data.hwid)

  const result = await activateLicense(data.key, data.hwid, data.deviceName, data.appVersion)
  if (result.code !== 'OK' || !result.license) {
    return result.code === 'OK'
      ? apiError(500, 'ERR_INTERNAL', 'Falha inesperada na ativação. Tente novamente.')
      : checkError(result.code)
  }

  // o lib registra ACTIVATED na primeira ativação; dispositivo novo em licença já ativa ganha evento próprio
  if (newDevice && existing.status !== 'PENDING_ACTIVATION') {
    await db.licenseEvent.create({
      data: {
        licenseId: result.license.id,
        type: 'DEVICE_ACTIVATED',
        meta: { hwidMasked: maskHwid(data.hwid), deviceName: data.deviceName ?? null, appVersion: data.appVersion ?? null },
      },
    })
  }

  const devices = await db.licenseDevice.count({
    where: { licenseId: result.license.id, revokedAt: null },
  })

  return NextResponse.json({
    deviceToken: result.deviceToken,
    status: result.license.status,
    plan: { slug: result.license.plan.slug, name: result.license.plan.name },
    expiresAt: result.license.expiresAt,
    deviceLimit: result.license.deviceLimit,
    devices,
  })
}
