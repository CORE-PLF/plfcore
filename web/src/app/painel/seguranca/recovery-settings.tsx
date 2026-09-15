'use client'

import { useActionState } from 'react'
import {
  generateRecoveryCodeAction,
  setupSecurityAction,
  type AuthFormState,
  type RecoveryCodeState,
} from '@/lib/actions/auth'
import { BRAND } from '@/lib/brand'
import { Field } from '@/components/ui'

interface QuestionOption {
  code: string
  label: string
}

function QuestionSelect({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string
  name: string
  options: QuestionOption[]
  defaultValue: string
}) {
  return (
    <div>
      <label htmlFor={name} className="type-kicker mb-1.5 block">
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} required className="field">
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function QuestionsForm({
  hasQuestions,
  options,
}: {
  hasQuestions: boolean
  options: QuestionOption[]
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(setupSecurityAction, {
    error: null,
  })

  return (
    <form action={action} className="max-w-sm space-y-4">
      <QuestionSelect label="PERGUNTA 1" name="pergunta1" options={options} defaultValue={options[0].code} />
      <Field label="RESPOSTA 1" name="resposta1" required minLength={3} autoComplete="off" />
      <QuestionSelect label="PERGUNTA 2" name="pergunta2" options={options} defaultValue={options[1].code} />
      <Field label="RESPOSTA 2" name="resposta2" required minLength={3} autoComplete="off" />
      {hasQuestions && (
        <Field
          label="SENHA ATUAL"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
        />
      )}
      <p className="text-xs text-ink-3">
        As respostas não diferenciam maiúsculas nem acentos. Elas ficam guardadas só como hash — nem o
        suporte consegue lê-las.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-signal">
          ERRO — {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending} className="btn btn--primary chamfer">
        {hasQuestions ? 'TROCAR PERGUNTAS' : 'SALVAR PERGUNTAS'}
      </button>
    </form>
  )
}

export function RecoveryCodeBlock({
  hasActiveCode,
  hasPassword,
}: {
  hasActiveCode: boolean
  hasPassword: boolean
}) {
  const [state, action, pending] = useActionState<RecoveryCodeState, FormData>(
    generateRecoveryCodeAction,
    { error: null },
  )

  if (state.code) {
    const txt = [
      `${BRAND.name} — CÓDIGO DE RECUPERAÇÃO DE CONTA`,
      '',
      state.code,
      '',
      'Guarde este arquivo em local seguro. Quem tiver o código consegue trocar a senha da conta.',
      'O código vale uma única vez e substitui qualquer código anterior.',
    ].join('\n')
    return (
      <div role="status" className="max-w-sm space-y-4">
        <p className="type-kicker">GUARDE SEU NOVO CÓDIGO</p>
        <p
          className="type-mono break-all px-3 py-2 text-sm text-ink-1"
          style={{ background: 'var(--color-void)', boxShadow: 'inset 0 0 0 1px var(--color-edge)' }}
        >
          {state.code}
        </p>
        <p className="text-sm text-ink-3">
          Este código aparece só agora e vale uma única vez. O código anterior deixou de valer.
        </p>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(txt)}`}
          download="resync-codigo-recuperacao.txt"
          className="btn btn--ghost chamfer inline-block"
        >
          BAIXAR .TXT
        </a>
      </div>
    )
  }

  if (!hasPassword)
    return (
      <p className="text-sm text-ink-2">
        Esta conta ainda não tem senha. Crie uma em &quot;Recuperar acesso&quot; na tela de login antes
        de gerar o código.
      </p>
    )

  return (
    <form action={action} className="max-w-sm space-y-4">
      <p className="text-sm text-ink-2">
        {hasActiveCode
          ? 'Você já tem um código ativo. Gerar um novo invalida o anterior.'
          : 'Nenhum código gerado. O código permite recuperar a conta mesmo sem e-mail e sem as perguntas.'}
      </p>
      <Field label="SENHA ATUAL" name="senha" type="password" required autoComplete="current-password" />
      {state.error && (
        <p role="alert" className="text-sm text-signal">
          ERRO — {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending} className="btn btn--primary chamfer">
        {hasActiveCode ? 'REGENERAR CÓDIGO' : 'GERAR CÓDIGO'}
      </button>
    </form>
  )
}
