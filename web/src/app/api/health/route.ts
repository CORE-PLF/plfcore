import { NextResponse } from 'next/server'

// Liveness: o processo responde.
export async function GET() {
  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
