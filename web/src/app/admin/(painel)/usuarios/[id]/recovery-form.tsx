'use client'

import { useActionState } from 'react'
import { adminRecoverAccountAction, type AdminRecoveryState } from '@/lib/actions/admin'

const initial: AdminRecoveryState = { error: null }

// Recuperação administrativa: gera link de redefinição de uso único (2h) para
// entregar pelo canal de suporte. As respostas antigas nunca aparecem — só
// existem como hash e são descartadas no processo.
export function AdminRecoveryForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(adminRecoverAccountAction, initial)

  if (state.resetUrl) {
    return (
      <div className="space-y-2">
        <p className="type-kicker text-ink-1">[OK] LINK GERADO — VALE 2 HORAS, USO ÚNICO</p>
        <p className="type-mono break-all bg-steel px-3 py-2 text-[12px] text-ink-1">{state.resetUrl}</p>
        <p className="text-[13px] text-ink-2">
          Entregue ao titular pelo canal de suporte, depois de confirmar a identidade. As perguntas
          de segurança e o código de recuperação antigos deixaram de valer e as sessões foram
          encerradas.
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-2">
      <p className="text-[13px] text-ink-2">
        Para quem esqueceu a senha E as respostas de segurança. Gera um link de redefinição de uso
        único; perguntas e código antigos são invalidados. Auditado.
      </p>
      <input type="hidden" name="id" value={userId} />
      <input
        name="reason"
        required
        minLength={4}
        maxLength={500}
        placeholder="Motivo (obrigatório)"
        aria-label="Motivo"
        className="field"
      />
      <input
        name="totp"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        required
        placeholder="Código 2FA (6 dígitos)"
        aria-label="Código 2FA de 6 dígitos"
        className="field type-mono"
        autoComplete="one-time-code"
      />
      {state.error ? <p className="text-[13px] text-signal">{state.error}</p> : null}
      <button type="submit" className="btn btn--danger chamfer w-full" disabled={pending}>
        {pending ? 'GERANDO…' : 'GERAR LINK DE RECUPERAÇÃO'}
      </button>
    </form>
  )
}
