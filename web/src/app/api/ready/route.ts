import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Readiness: banco alcançável.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ ready: true })
  } catch {
    return NextResponse.json({ ready: false, error: 'banco indisponível' }, { status: 503 })
  }
}
