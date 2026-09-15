'use client'

import { useActionState } from 'react'
import {
  confirmTotpAction,
  removeTotpAction,
  startTotpSetupAction,
  type TotpSetupState,
} from '@/lib/actions/admin'

const initial: TotpSetupState = { error: null }

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [startState, startAction, startPending] = useActionState(startTotpSetupAction, initial)
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTotpAction, initial)
  const [removeState, removeAction, removePending] = useActionState(removeTotpAction, initial)

  if (confirmState.done) {
    const codes = confirmState.recoveryCodes ?? []
    const txt = `CÓDIGOS DE RECUPERAÇÃO 2FA — RESYNC OPS\nCada código funciona UMA vez, no lugar do código do autenticador.\n\n${codes.join('\n')}\n`
    return (
      <div className="space-y-3">
        <p className="type-kicker text-ink-1">[OK] 2FA ATIVADA. O próximo acesso ao painel vai pedir o código.</p>
        {codes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] text-ink-2">
              GUARDE OS CÓDIGOS DE RECUPERAÇÃO — aparecem só agora. Cada um vale UMA vez, no lugar
              do código do autenticador.
            </p>
            <p className="type-mono grid grid-cols-2 gap-x-6 gap-y-1 bg-steel px-3 py-2 text-sm text-ink-1 sm:grid-cols-4">
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </p>
            <a
              className="btn btn--ghost btn--sm chamfer inline-block"
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(txt)}`}
              download="resync-2fa-codigos-recuperacao.txt"
            >
              BAIXAR .TXT
            </a>
          </div>
        )}
        <a className="btn btn--primary btn--sm chamfer inline-block" href="/admin">
          IR PARA O PAINEL
        </a>
      </div>
    )
  }
  if (removeState.removed) {
    return <p className="type-kicker text-ink-1">[OK] 2FA REMOVIDA DESTA CONTA.</p>
  }

  if (enabled) {
    return (
      <form action={removeAction} className="space-y-2">
        <p className="text-[13px] text-ink-2">2FA está ATIVA nesta conta. Para remover, confirme sua senha.</p>
        <input
          name="password"
          type="password"
          required
          placeholder="Senha da conta"
          aria-label="Senha da conta"
          className="field max-w-xs"
          autoComplete="current-password"
        />
        {removeState.error ? <p className="text-[13px] text-signal">{removeState.error}</p> : null}
        <button type="submit" className="btn btn--danger btn--sm chamfer" disabled={removePending}>
          {removePending ? 'REMOVENDO…' : 'REMOVER 2FA'}
        </button>
      </form>
    )
  }

  const secret = confirmState.secret ?? startState.secret
  const secretBase32 = confirmState.secretBase32 ?? startState.secretBase32
  const qr = confirmState.qr ?? startState.qr

  if (!secret) {
    return (
      <form action={startAction} className="space-y-2">
        <p className="text-[13px] text-ink-2">
          2FA está INATIVA. Gere um segredo, cadastre no aplicativo autenticador e confirme com um código.
        </p>
        {startState.error ? <p className="text-[13px] text-signal">{startState.error}</p> : null}
        <button type="submit" className="btn btn--primary btn--sm chamfer" disabled={startPending}>
          {startPending ? 'GERANDO…' : 'GERAR SEGREDO 2FA'}
        </button>
      </form>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-2">
        Aponte a câmera do aplicativo autenticador (Google Authenticator, Aegis, 1Password…) para o
        código:
      </p>
      {qr ? (
        // fundo branco de propósito: leitor de QR erra em código invertido
        <svg
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          width={200}
          height={200}
          role="img"
          aria-label="QR Code do segredo de verificação em duas etapas"
          shapeRendering="crispEdges"
          className="block bg-ink-1"
        >
          <path d={qr.d} fill="var(--color-void)" />
        </svg>
      ) : null}
      <details>
        <summary className="type-kicker cursor-pointer text-ink-3 hover:text-ink-1">
          NÃO CONSEGUE ESCANEAR? DIGITE O SEGREDO
        </summary>
        <p className="type-mono mt-2 break-all bg-steel px-3 py-2 text-sm text-ink-1">
          {secretBase32}
        </p>
      </details>
      <form action={confirmAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="secret" value={secret} />
        <input
          name="code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          placeholder="000000"
          aria-label="Código de 6 dígitos"
          className="field type-mono max-w-[140px] text-center tracking-[0.3em]"
        />
        <button type="submit" className="btn btn--primary btn--sm chamfer" disabled={confirmPending}>
          {confirmPending ? 'CONFIRMANDO…' : 'CONFIRMAR E ATIVAR'}
        </button>
      </form>
      {confirmState.error ? <p className="text-[13px] text-signal">{confirmState.error}</p> : null}
    </div>
  )
}
