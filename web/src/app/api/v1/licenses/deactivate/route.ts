import type { NextRequest } from 'next/server'
import { apiError, checkRate, keyHwidSchema, parseBody } from '../../_lib'

// DESCONTINUADO: a licença é individual e vinculada à instalação — o cliente
// não libera a vaga sozinho (senão deactivate+activate contornaria a regra de
// nova licença após formatação). Troca de instalação = nova compra; exceções
// somente pelo suporte/admin no painel administrativo.

export async function POST(req: NextRequest) {
  const { res } = await parseBody(req, keyHwidSchema)
  if (res) return res
  const rl = await checkRate(req, 'deactivate', '', 10)
  if (rl) return rl

  return apiError(
    410,
    'ERR_DEACTIVATE_DISABLED',
    'A desativação pelo aplicativo foi descontinuada: a licença é vinculada à instalação do Windows. Para trocar de instalação, adquira uma nova licença no painel. Casos excepcionais: abra um chamado no suporte.',
  )
}
