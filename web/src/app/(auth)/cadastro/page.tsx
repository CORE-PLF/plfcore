import type { Metadata } from 'next'
import Link from 'next/link'
import { Kicker } from '@/components/ui'
import { RegisterForm } from './register-form'

export const metadata: Metadata = { title: 'CRIAR CONTA' }

export default function CadastroPage() {
  return (
    <>
      <Kicker>ACESSO</Kicker>
      <h1 className="type-display mt-1 text-2xl">CRIAR CONTA</h1>

      {/* Cadastro por Discord desativado por enquanto — religar quando decidirmos.
      <a
        href="/api/auth/discord"
        className="btn btn--primary chamfer mt-5 w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink-1"
      >
        CONTINUAR COM DISCORD
      </a>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="type-kicker">OU</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      */}

      <RegisterForm />

      <p className="mt-6 text-sm text-ink-3">
        Já tem conta?{' '}
        <Link href="/entrar" className="text-ink-2 underline underline-offset-4 hover:text-ink-1">
          Entrar
        </Link>
      </p>
    </>
  )
}
