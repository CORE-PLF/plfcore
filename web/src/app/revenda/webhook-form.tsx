'use client'

import { useActionState } from 'react'
import { salvarWebhookAction, type RevendaFormState } from '@/lib/actions/revenda'

const initial: RevendaFormState = { error: null }

// URL pública HTTPS — validada no servidor contra SSRF (IP privado, localhost,
// metadata). Vazio desativa as notificações.
export function WebhookForm({ currentUrl }: { currentUrl: string | null }) {
  const [state, action, pending] = useActionState(salvarWebhookAction, initial)

  return (
    <form action={action} className="space-y-2">
      <input
        name="webhookUrl"
        type="url"
        defaultValue={currentUrl ?? ''}
        placeholder="https://seusistema.com/webhooks/plfcore"
        aria-label="URL do webhook"
        className="field w-full"
        maxLength={500}
      />
      {state.error ? <p className="text-[13px] text-signal">{state.error}</p> : null}
      {state.ok ? <p className="type-kicker text-ink-1">[OK] WEBHOOK SALVO.</p> : null}
      <button type="submit" className="btn btn--ghost btn--sm chamfer" disabled={pending}>
        {pending ? 'SALVANDO…' : 'SALVAR WEBHOOK'}
      </button>
    </form>
  )
}
