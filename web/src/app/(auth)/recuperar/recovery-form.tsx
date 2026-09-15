'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import {
  answerRecoveryAction,
  recoveryCodeAction,
  startRecoveryAction,
  type RecoveryState,
} from '@/lib/actions/auth'
import { Field } from '@/components/ui'

const initial: RecoveryState = { error: null }

const BTN =
  'btn btn--primary w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink-1'

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-blood">
      ERRO — {message}
    </p>
  )
}

function CodeForm({
  email,
  action,
  pending,
  error,
}: {
  email: string
  action: (formData: FormData) => void
  pending: boolean
  error: string | null
}) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <Field
        label="CÓDIGO DE RECUPERAÇÃO"
        name="codigo"
        required
        placeholder="BBX-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
        autoComplete="off"
      />
      <ErrorLine message={error} />
      <button type="submit" disabled={pending} aria-busy={pending} className={BTN}>
        VALIDAR CÓDIGO
      </button>
    </form>
  )
}

export function RecoveryFlow() {
  const [start, startAction, startPending] = useActionState(startRecoveryAction, initial)
  const [answer, answerAction, answerPending] = useActionState(answerRecoveryAction, initial)
  const [code, codeAction, codePending] = useActionState(recoveryCodeAction, initial)

  // etapa final: código validado — mostra o novo código UMA vez
  if (code.newCode && code.resetUrl) {
    return (
      <div role="status" className="space-y-4">
        <p className="type-kicker">GUARDE SEU NOVO CÓDIGO</p>
        <p
          className="type-mono break-all px-3 py-2 text-sm text-ink-1"
          style={{ background: 'var(--color-void)', border: '1px solid var(--color-edge)', borderRadius: 6 }}
        >
          {code.newCode}
        </p>
        <p className="text-sm text-ink-3">
          O código anterior deixou de valer. Este novo código aparece só agora — anote ou salve antes
          de continuar.
        </p>
        <Link href={code.resetUrl} className={BTN}>
          CONTINUAR PARA NOVA SENHA
        </Link>
      </div>
    )
  }

  // etapa 2a: conta com perguntas configuradas
  if (start.questions && start.email) {
    return (
      <div className="space-y-6">
        <form action={answerAction} className="space-y-4">
          <input type="hidden" name="email" value={start.email} />
          {start.questions.map((q) => (
            <Field
              key={q.slot}
              label={q.label}
              name={`resposta${q.slot}`}
              required
              autoComplete="off"
            />
          ))}
          <ErrorLine message={answer.error} />
          <button type="submit" disabled={answerPending} aria-busy={answerPending} className={BTN}>
            VERIFICAR RESPOSTAS
          </button>
        </form>

        <details>
          <summary className="type-kicker cursor-pointer">USAR CÓDIGO DE RECUPERAÇÃO</summary>
          <div className="mt-4">
            <CodeForm email={start.email} action={codeAction} pending={codePending} error={code.error} />
          </div>
        </details>
      </div>
    )
  }

  // etapa 2b: sem perguntas visíveis — só código (mensagem neutra, sem confirmar conta)
  if (start.askCode && start.email) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-3">
          Se esta conta tiver perguntas de segurança, elas aparecerão aqui. Você também pode usar seu
          código de recuperação.
        </p>
        <CodeForm email={start.email} action={codeAction} pending={codePending} error={code.error} />
      </div>
    )
  }

  // etapa 1: e-mail
  return (
    <form action={startAction} className="space-y-4">
      <Field label="E-mail" name="email" type="email" required autoComplete="email" />
      <ErrorLine message={start.error} />
      <button type="submit" disabled={startPending} aria-busy={startPending} className={BTN}>
        CONTINUAR
      </button>
    </form>
  )
}
