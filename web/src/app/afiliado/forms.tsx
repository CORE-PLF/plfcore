'use client'

import { useActionState, useState } from 'react'
import { Field } from '@/components/ui'
import {
  atualizarPixAction,
  criarAfiliadoAction,
  solicitarSaqueAction,
  type AfiliadoFormState,
} from '@/lib/actions/afiliado'

const initial: AfiliadoFormState = { error: null }

function ErroInline({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <p role="alert" className="type-mono text-[12px]" style={{ color: 'var(--color-signal)' }}>
      ERRO: {msg}
    </p>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm chamfer"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        } catch {
          // sem permissão de clipboard: o texto está visível ao lado para copiar manualmente
        }
      }}
    >
      {copiado ? 'COPIADO ✓' : 'COPIAR'}
    </button>
  )
}

export function InscricaoForm() {
  const [state, action, pending] = useActionState(criarAfiliadoAction, initial)
  return (
    <form action={action} className="space-y-4">
      <div>
        <Field label="CÓDIGO DESEJADO" name="code" required minLength={4} placeholder="EX.: MEUCANAL" />
        <p className="mt-1.5 text-[12px] text-ink-4">
          4 a 20 caracteres, só letras e números. Vira seu link: /a/CÓDIGO. Imutável após aprovação.
        </p>
      </div>
      <Field
        label="CHAVE PIX"
        name="pix"
        required
        minLength={3}
        placeholder="CPF, e-mail, telefone ou chave aleatória"
      />
      <ErroInline msg={state.error} />
      <button type="submit" disabled={pending} className="btn btn--primary chamfer">
        {pending ? 'ENVIANDO…' : 'ENVIAR INSCRIÇÃO'}
      </button>
    </form>
  )
}

export function SaqueForm({ pixPadrao, minLabel }: { pixPadrao: string; minLabel: string }) {
  const [state, action, pending] = useActionState(solicitarSaqueAction, initial)
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="valor" className="type-kicker mb-1.5 block">
          VALOR (R$)
        </label>
        <input
          id="valor"
          name="valor"
          type="text"
          inputMode="decimal"
          required
          placeholder="0,00"
          className="field type-mono"
        />
        <p className="mt-1.5 text-[12px] text-ink-4">
          Valor mínimo: <span className="type-mono">{minLabel}</span>.
        </p>
      </div>
      <Field label="CHAVE PIX" name="pix" required minLength={3} defaultValue={pixPadrao} />
      <ErroInline msg={state.error} />
      <button type="submit" disabled={pending} className="btn btn--primary chamfer">
        {pending ? 'SOLICITANDO…' : 'SOLICITAR SAQUE'}
      </button>
    </form>
  )
}

export function PixForm({ pixAtual }: { pixAtual: string }) {
  const [state, action, pending] = useActionState(atualizarPixAction, initial)
  return (
    <form action={action} className="space-y-4">
      <Field label="CHAVE PIX" name="pix" required minLength={3} defaultValue={pixAtual} />
      <ErroInline msg={state.error} />
      {state.ok && !state.error && (
        <p className="type-mono text-[12px] text-ink-1">✓ CHAVE PIX ATUALIZADA</p>
      )}
      <button type="submit" disabled={pending} className="btn btn--primary chamfer">
        {pending ? 'SALVANDO…' : 'SALVAR CHAVE PIX'}
      </button>
    </form>
  )
}
