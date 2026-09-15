'use client'

import { useActionState } from 'react'
import { criarRevendaAction, type RevendaFormState } from '@/lib/actions/revenda'
import { Field } from '@/components/ui'

const initial: RevendaFormState = { error: null }

export function InscricaoForm() {
  const [state, action, pending] = useActionState(criarRevendaAction, initial)

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label="NOME DO NEGÓCIO"
        name="businessName"
        required
        minLength={2}
        placeholder="Loja, comunidade ou serviço que vai revender"
      />
      <div>
        <label htmlFor="note" className="type-kicker mb-1.5 block">
          NOTA (OPCIONAL)
        </label>
        <textarea
          id="note"
          name="note"
          rows={4}
          maxLength={1000}
          placeholder="Como pretende revender, volume estimado, links relevantes."
          className="field"
          style={{ resize: 'vertical', minHeight: 96 }}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-signal)' }}>
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn--primary chamfer self-start">
        {pending ? 'ENVIANDO…' : 'ENVIAR INSCRIÇÃO'}
      </button>
    </form>
  )
}
