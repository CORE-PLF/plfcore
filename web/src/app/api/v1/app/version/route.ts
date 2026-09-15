import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getInstaller } from '@/lib/installer'
import { apiError, checkRate } from '../../_lib'

export async function GET(req: NextRequest) {
  const rl = await checkRate(req, 'app-version', '', 30)
  if (rl) return rl

  const inst = await getInstaller()
  if (!inst) return apiError(404, 'ERR_NO_VERSION', 'Nenhuma versão publicada no momento. Tente mais tarde.')

  return NextResponse.json({
    version: inst.version,
    notes: inst.notes ?? '',
    checksum: inst.checksum,
    // origem 'env' não tem data de publicação — o contrato exige o campo
    publishedAt: inst.publishedAt ?? new Date().toISOString(),
  })
}
