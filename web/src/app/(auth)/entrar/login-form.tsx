'use client'

import { useActionState } from 'react'
import { loginAction } from '@/lib/actions/auth'
import { Field } from '@/components/ui'

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, { error: null })

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="E-mail" name="email" type="email" required autoComplete="email" />
      <Field label="Senha" name="password" type="password" required autoComplete="current-password" />
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
        ENTRAR
      </button>
    </form>
  )
}
