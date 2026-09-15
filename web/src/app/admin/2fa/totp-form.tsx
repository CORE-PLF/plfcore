'use client'

import { useActionState } from 'react'
import { totpGateAction, type TotpGateState } from '@/lib/actions/admin'

const initial: TotpGateState = { error: null }

export function TotpGateForm() {
  const [state, action, pending] = useActionState(totpGateAction, initial)
  return (
    <form action={action} className="mt-4 space-y-3">
      <input
        name="code"
        autoComplete="one-time-code"
        maxLength={16}
        required
        autoFocus
        className="field type-mono text-center text-xl tracking-[0.3em]"
        placeholder="000000"
        aria-label="Código de 6 dígitos ou código de recuperação"
      />
      {state.error ? <p className="text-[13px] text-signal">{state.error}</p> : null}
      <button type="submit" className="btn btn--primary chamfer w-full" disabled={pending}>
        {pending ? 'VERIFICANDO…' : 'VERIFICAR'}
      </button>
    </form>
  )
}
