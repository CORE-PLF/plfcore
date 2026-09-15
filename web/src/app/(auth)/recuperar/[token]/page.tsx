import type { Metadata } from 'next'
import Link from 'next/link'
import { Kicker } from '@/components/ui'
import { ResetPasswordForm } from './reset-form'

export const metadata: Metadata = { title: 'NOVA SENHA' }

export default async function NovaSenhaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  return (
    <>
      <Kicker>ACESSO</Kicker>
      <h1 className="type-display mt-1 text-2xl">NOVA SENHA</h1>
      <p className="mt-3 text-sm text-ink-3">
        Defina a nova senha da conta. As sessões antigas serão encerradas.
      </p>

      <div className="mt-5">
        <ResetPasswordForm token={token} />
      </div>

      <p className="mt-6 text-sm text-ink-3">
        Link expirado?{' '}
        <Link href="/recuperar" className="text-ink-2 underline underline-offset-4 hover:text-ink-1">
          Pedir um novo
        </Link>
      </p>
    </>
  )
}
