import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { env, releaseApiEnabled } from '@/lib/env'

// Credencial de MÁQUINA da esteira de release — não é sessão de usuário e não
// substitui o painel. Quem tem este token consegue publicar um instalador que as
// pessoas rodam como administrador, e nada além disso: nenhuma rota aqui lê ou
// escreve licença, pedido, usuário ou repasse.
//
// Sem RELEASE_TOKEN no ambiente as rotas respondem 404: em uma instalação que
// não usa esteira automatizada elas simplesmente não existem.

export type ReleaseAuth = 'ok' | 'desligado' | 'negado'

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  // timingSafeEqual exige mesmo tamanho; comparar o tamanho antes vazaria só o
  // comprimento, que não é o segredo.
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

export function autenticarRelease(req: NextRequest): ReleaseAuth {
  if (!releaseApiEnabled()) return 'desligado'
  const header = req.headers.get('authorization') ?? ''
  const prefixo = 'Bearer '
  if (!header.startsWith(prefixo)) return 'negado'
  return iguais(header.slice(prefixo.length), env.RELEASE_TOKEN) ? 'ok' : 'negado'
}
