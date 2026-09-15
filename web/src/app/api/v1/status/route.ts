import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { checkRate, serverTime } from '../_lib'

export async function GET(req: NextRequest) {
  const rl = await checkRate(req, 'status', '', 30)
  if (rl) return rl

  let database: 'ok' | 'error' = 'ok'
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    database = 'error'
  }

  return NextResponse.json({ ok: true, serverTime: serverTime(), database })
}
