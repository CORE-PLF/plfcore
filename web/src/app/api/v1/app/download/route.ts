import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { getInstaller, signInstallerToken } from '@/lib/installer'
import { findLicenseByKey, licenseStatusCheck } from '@/lib/licensing'
import { apiError, checkError, checkRate } from '../../_lib'

// Retorna a URL do instalador (o app baixa; sem redirect). Exige licença
// válida no header X-License-Key. PENDING_ACTIVATION passa: quem acabou de
// comprar precisa baixar antes de ativar.
// A URL é assinada e expira em 10 minutos — vazou, morre sozinha.

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-license-key')?.trim()
  if (!key) {
    return apiError(401, 'ERR_LICENSE_KEY_REQUIRED', 'Envie a chave de licença no header X-License-Key.')
  }
  const rl = await checkRate(req, 'app-download', key, 10)
  if (rl) return rl

  const license = await findLicenseByKey(key)
  const check = licenseStatusCheck(license)
  if (check.code !== 'OK' || !license) return checkError(check.code as Exclude<typeof check.code, 'OK'>)

  const inst = await getInstaller()
  if (!inst) return apiError(404, 'ERR_NO_VERSION', 'Nenhuma versão publicada no momento. Tente mais tarde.')

  const url = new URL('/download/arquivo', env.APP_URL)
  url.searchParams.set('v', inst.version)
  url.searchParams.set('t', signInstallerToken(inst.version))
  return NextResponse.json({ url: url.toString(), checksum: inst.checksum, version: inst.version })
}
