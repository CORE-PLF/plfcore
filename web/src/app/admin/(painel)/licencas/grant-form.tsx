'use client'

import { useActionState } from 'react'
import { grantLicenseAction, type GrantLicenseState } from '@/lib/actions/admin'

const initial: GrantLicenseState = { error: null }

// Concessão manual: a chave em claro aparece UMA vez, aqui — depois só mascarada.
export function GrantLicenseForm({ plans }: { plans: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(grantLicenseAction, initial)

  if (state.error === null && state.licenseId) {
    return (
      <div className="space-y-2 p-4" style={{ boxShadow: 'inset 0 0 0 1px var(--color-edge)' }}>
        <p className="type-kicker text-ink-1">
          {state.extended ? '[OK] LICENÇA EXISTENTE ESTENDIDA' : '[OK] LICENÇA EMITIDA'}
        </p>
        {state.plainKey ? (
          <>
            <p className="type-mono break-all bg-steel px-3 py-2 text-sm text-ink-1">{state.plainKey}</p>
            <p className="text-[12px] text-heat">
              Copie agora. Esta chave não será exibida de novo — depois só a versão mascarada.
            </p>
          </>
        ) : (
          <p className="text-[12px] text-ink-2">O usuário já tinha licença viva deste produto; o prazo foi estendido.</p>
        )}
        <a href={`/admin/licencas/${state.licenseId}`} className="btn btn--ghost btn--sm chamfer">
          ABRIR LICENÇA
        </a>
      </div>
    )
  }

  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <input
        name="email"
        type="email"
        required
        placeholder="E-mail do usuário"
        aria-label="E-mail do usuário"
        className="field"
      />
      <select name="planId" required defaultValue="" className="field" aria-label="Plano">
        <option value="" disabled>
          PLANO
        </option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        name="reason"
        required
        minLength={4}
        placeholder="Motivo (obrigatório)"
        aria-label="Motivo"
        className="field sm:col-span-2"
      />
      {state.error ? <p className="text-[13px] text-signal sm:col-span-2">{state.error}</p> : null}
      <button type="submit" className="btn btn--primary chamfer sm:col-span-2" disabled={pending}>
        {pending ? 'EMITINDO…' : 'CONCEDER LICENÇA'}
      </button>
    </form>
  )
}
