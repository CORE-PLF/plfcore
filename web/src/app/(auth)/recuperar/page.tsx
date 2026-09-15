import type { Metadata } from 'next'
import Link from 'next/link'
import { Kicker } from '@/components/ui'
import { RecoveryFlow } from './recovery-form'

export const metadata: Metadata = { title: 'RECUPERAR ACESSO' }

export default function RecuperarPage() {
  return (
    <>
      <Kicker>ACESSO</Kicker>
      <h1 className="type-display mt-1 text-2xl">Recuperar acesso</h1>
      <p className="mt-3 text-sm text-ink-3">
        Informe o e-mail da conta. A recuperação usa suas perguntas de segurança ou seu código de
        recuperação — sem depender de e-mail.
      </p>

      <div className="mt-5">
        <RecoveryFlow />
      </div>

      <p className="mt-6 text-sm text-ink-3">
        Lembrou a senha?{' '}
        <Link href="/entrar" className="text-ink-2 underline underline-offset-4 hover:text-ink-1">
          Entrar
        </Link>
      </p>
    </>
  )
}
