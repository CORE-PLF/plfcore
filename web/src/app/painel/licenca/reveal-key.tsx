'use client'

import { useActionState, useState } from 'react'
import { revelarChaveAction } from '@/lib/actions/painel'

export function RevealKey({ licenseId, masked }: { licenseId: string; masked: string }) {
  const [state, formAction, pending] = useActionState(revelarChaveAction, {
    key: null,
    error: null,
  })
  const [oculta, setOculta] = useState(false)
  const [copiada, setCopiada] = useState(false)
  const visivel = state.key !== null && !oculta

  return (
    <div>
      <p
        className="type-mono break-all px-4 py-3 text-base text-ink-1"
        style={{ background: 'var(--color-void)', boxShadow: 'inset 0 0 0 1px var(--color-edge)' }}
        aria-live="polite"
      >
        {visivel ? state.key : masked}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {visivel ? (
          <>
            <button
              type="button"
              className="btn btn--ghost btn--sm chamfer"
              onClick={() => setOculta(true)}
            >
              OCULTAR
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm chamfer"
              onClick={async () => {
                await navigator.clipboard.writeText(state.key ?? '')
                setCopiada(true)
                setTimeout(() => setCopiada(false), 2000)
              }}
            >
              {copiada ? '✓ COPIADA' : 'COPIAR'}
            </button>
          </>
        ) : (
          <form action={formAction}>
            <input type="hidden" name="licenseId" value={licenseId} />
            <button
              type="submit"
              className="btn btn--ghost btn--sm chamfer"
              disabled={pending}
              onClick={() => setOculta(false)}
            >
              {pending ? 'VERIFICANDO…' : 'REVELAR'}
            </button>
          </form>
        )}
      </div>

      {state.error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-signal)' }} role="alert">
          {state.error}
        </p>
      )}
    </div>
  )
}
