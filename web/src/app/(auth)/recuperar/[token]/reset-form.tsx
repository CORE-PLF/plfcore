'use client'

import { useActionState } from 'react'
import { resetPasswordAction } from '@/lib/actions/auth'
import { Field } from '@/components/ui'

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, { error: null })

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field
        label="Nova senha"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        minLength={8}
        placeholder="Mínimo de 8 caracteres"
      />
      {state.error && (
        <p role="alert" className="text-sm text-signal">
          ERRO — {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="btn btn--primary chamfer w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink-1"
      >
        REDEFINIR SENHA
      </button>
    </form>
  )
}
