'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { registerAction } from '@/lib/actions/auth'
import { Field } from '@/components/ui'

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, { error: null })

  return (
    <form action={action} className="space-y-4">
      {/* honeypot anti-bot: invisível para humanos; preenchido = cadastro descartado */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <Field label="Nome" name="name" required autoComplete="name" minLength={2} />
      <Field label="E-mail" name="email" type="email" required autoComplete="email" />
      <Field
        label="Senha"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        minLength={8}
        placeholder="Mínimo de 8 caracteres"
      />

      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <input type="checkbox" name="aceite" required className="mt-0.5 size-4 accent-signal" />
        <span>
          Li e aceito os{' '}
          <Link href="/legal/termos" className="text-ink-1 underline underline-offset-4">
            Termos de Uso
          </Link>{' '}
          e a{' '}
          <Link href="/legal/privacidade" className="text-ink-1 underline underline-offset-4">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-blood">
          ERRO — {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="btn btn--primary w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink-1"
      >
        CRIAR CONTA
      </button>
    </form>
  )
}
