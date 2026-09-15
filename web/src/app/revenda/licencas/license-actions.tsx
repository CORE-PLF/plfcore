'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  revelarChaveAction,
  revogarLicencaAction,
  type RevendaFormState,
} from '@/lib/actions/revenda'

const initial: RevendaFormState = { error: null }

export function LicenseActions({
  licenseId,
  keyMasked,
  canRevoke,
}: {
  licenseId: string
  keyMasked: string
  canRevoke: boolean
}) {
  const [key, setKey] = useState<string | null>(null)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [revealing, startReveal] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [revokeState, revokeAction, revoking] = useActionState(revogarLicencaAction, initial)

  return (
    <div className="flex flex-col gap-2">
      <span className="type-mono whitespace-nowrap" style={{ color: 'var(--color-ink-1)' }}>
        {key ?? keyMasked}
      </span>

      <div className="flex flex-wrap gap-2">
        {key === null ? (
          <button
            type="button"
            disabled={revealing}
            className="btn btn--ghost btn--sm chamfer"
            onClick={() =>
              startReveal(async () => {
                const res = await revelarChaveAction(licenseId)
                if ('key' in res) {
                  setKey(res.key)
                  setRevealError(null)
                } else setRevealError(res.error)
              })
            }
          >
            {revealing ? 'REVELANDO…' : 'REVELAR'}
          </button>
        ) : (
          <button type="button" className="btn btn--ghost btn--sm chamfer" onClick={() => setKey(null)}>
            OCULTAR
          </button>
        )}

        {canRevoke && !confirming && (
          <button type="button" className="btn btn--danger btn--sm chamfer" onClick={() => setConfirming(true)}>
            REVOGAR
          </button>
        )}
      </div>

      {revealError && (
        <p role="alert" className="text-xs" style={{ color: 'var(--color-signal)' }}>
          {revealError}
        </p>
      )}

      {canRevoke && confirming && (
        <form action={revokeAction} className="hazard flex w-64 flex-col gap-2 p-3">
          <input type="hidden" name="licenseId" value={licenseId} />
          <p className="text-xs" style={{ color: 'var(--color-ink-1)' }}>
            Revogar desativa a licença do cliente na próxima validação. Ação sem desfazer por aqui.
          </p>
          <label htmlFor={`reason-${licenseId}`} className="type-kicker">
            MOTIVO (OBRIGATÓRIO)
          </label>
          <textarea
            id={`reason-${licenseId}`}
            name="reason"
            required
            minLength={5}
            rows={2}
            className="field"
            style={{ resize: 'vertical', minHeight: 56 }}
            placeholder="Ex.: cliente pediu reembolso"
          />
          {revokeState.error && (
            <p role="alert" className="text-xs" style={{ color: 'var(--color-signal)' }}>
              {revokeState.error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={revoking} className="btn btn--danger btn--sm chamfer">
              {revoking ? 'REVOGANDO…' : 'CONFIRMAR REVOGAÇÃO'}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm chamfer"
              onClick={() => setConfirming(false)}
            >
              CANCELAR
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
