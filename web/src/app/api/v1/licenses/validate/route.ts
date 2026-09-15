import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { findDeviceByToken, licenseStatusCheck } from '@/lib/licensing'
import { checkError, checkRate, deviceNotBound, parseBody, serverTime, tokenHwidSchema } from '../../_lib'

// serverTime na resposta: o app compara com o relógio local (anti-fraude de data)

export async function POST(req: NextRequest) {
  const { data, res } = await parseBody(req, tokenHwidSchema)
  if (res) return res
  const rl = await checkRate(req, 'validate', data.token, 60)
  if (rl) return rl

  const device = await findDeviceByToken(data.token)
  if (!device || device.hwid !== data.hwid || device.revokedAt) return deviceNotBound()
  const license = device.license
  const check = licenseStatusCheck(license)
  if (check.code !== 'OK') return checkError(check.code as Exclude<typeof check.code, 'OK'>)

  const now = new Date()
  await Promise.all([
    db.license.update({ where: { id: license.id }, data: { lastValidatedAt: now } }),
    db.licenseDevice.update({ where: { id: device.id }, data: { lastSeenAt: now, tokenLastUsedAt: now } }),
  ])

  return NextResponse.json({
    status: license.status,
    plan: { slug: license.plan.slug, name: license.plan.name },
    expiresAt: license.expiresAt,
    serverTime: serverTime(),
  })
}
