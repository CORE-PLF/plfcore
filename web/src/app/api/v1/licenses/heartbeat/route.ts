import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getGates } from '@/lib/gates'
import { findDeviceByToken, licenseStatusCheck } from '@/lib/licensing'
import { appOutdated, checkError, checkRate, deviceNotBound, effectiveMinVersion, heartbeatSchema, parseBody, serverTime } from '../../_lib'

// Batimento leve: só lastSeenAt/appVersion do dispositivo (sem lastValidatedAt).

export async function POST(req: NextRequest) {
  const { data, res } = await parseBody(req, heartbeatSchema)
  if (res) return res
  const rl = await checkRate(req, 'heartbeat', data.token, 120)
  if (rl) return rl

  const device = await findDeviceByToken(data.token)
  if (!device || device.hwid !== data.hwid || device.revokedAt) return deviceNotBound()
  const license = device.license
  const check = licenseStatusCheck(license)
  if (check.code !== 'OK') return checkError(check.code as Exclude<typeof check.code, 'OK'>)

  const gates = await getGates()
  const outdated = appOutdated(effectiveMinVersion(license.minAppVersion, gates.minDesktopVersion), data.appVersion)
  if (outdated) return outdated

  await db.licenseDevice.update({
    where: { id: device.id },
    data: {
      lastSeenAt: new Date(),
      tokenLastUsedAt: new Date(),
      appVersion: data.appVersion ?? device.appVersion,
    },
  })

  return NextResponse.json({
    status: license.status,
    plan: { slug: license.plan.slug, name: license.plan.name },
    expiresAt: license.expiresAt,
    serverTime: serverTime(),
  })
}
