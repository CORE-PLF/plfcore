import type { Metadata } from 'next'
import Link from 'next/link'
import { Kicker } from '@/components/ui'
import { safeNext } from '@/lib/auth'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'ENTRAR' }

const ERROS: Record<string, string> = {
  'discord-state':
    'A autorização do Discord expirou ou não pôde ser validada. Tente entrar de novo.',
  'discord-token': 'O Discord não confirmou a autorização. Tente de novo em instantes.',
  'discord-perfil': 'Não foi possível ler seu perfil no Discord. Tente de novo ou entre com e-mail e senha.',
  'discord-sem-email':
    'Sua conta do Discord não tem e-mail. Adicione um e-mail no Discord ou entre com e-mail e senha.',
  'conta-suspensa': 'Conta suspensa. Fale com o suporte para reativar o acesso.',
}

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const q = await searchParams
  const erroKey = typeof q.erro === 'string' ? q.erro : null
  const erro = erroKey ? (ERROS[erroKey] ?? 'Falha no login. Tente de novo.') : null
  const next = safeNext(typeof q.next === 'string' ? q.next : null)

  return (
    <>
      <Kicker>ACESSO</Kicker>
      <h1 className="type-display mt-1 text-2xl">Entrar</h1>

      <div className="mt-5 space-y-3" role="status">
        {q.reset === 'ok' && (
          <p className="text-sm text-ink-1">✓ Senha redefinida. Entre com a nova senha.</p>
        )}
      </div>
      {erro && (
        <p role="alert" className="mt-3 text-sm text-blood">
          ERRO — {erro}
        </p>
      )}

      {/* Login por Discord desativado por enquanto — religar quando decidirmos.
      <a
        href="/api/auth/discord"
        className="btn btn--primary mt-5 w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink-1"
      >
        ENTRAR COM DISCORD
      </a>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="type-kicker">OU</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      */}

      <LoginForm next={next ?? undefined} />

      <div className="mt-6 flex justify-between text-sm">
        <Link href="/recuperar" className="text-ink-3 underline underline-offset-4 hover:text-ink-1">
          Recuperar acesso
        </Link>
        <Link href="/cadastro" className="text-ink-3 underline underline-offset-4 hover:text-ink-1">
          Criar conta
        </Link>
      </div>
    </>
  )
}
