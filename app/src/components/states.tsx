import { StatusLED } from './StatusLED'
import { Button } from './Button'
import { useT } from '../i18n'
import { kitDict } from './i18n'
import './kit.css'

/** Estado vazio: código mono + convite à ação, LED respirando lento. */
export function EmptyState({ code, message, action }: { code: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <StatusLED state="off" slow />
      <p className="type-mono text-xs tracking-[0.14em] text-ink-3">{code}</p>
      <p className="max-w-sm text-sm text-ink-2">{message}</p>
      {action}
    </div>
  )
}

/** Erro: signal + borda dupla (padrão, não só cor) + o que fazer. */
export function ErrorState({ what, todo, onRetry }: { what: string; todo: string; onRetry?: () => void }) {
  const t = useT(kitDict)
  return (
    <div className="border border-signal p-px">
      <div className="border border-signal/40 p-4">
        <p className="type-mono text-xs font-bold tracking-[0.1em] text-signal">{what}</p>
        <p className="mt-1 text-sm text-ink-2">{todo}</p>
        {onRetry && (
          <Button size="sm" variant="danger" className="mt-3" onClick={onRetry}>
            {t('tentarNovamente')}
          </Button>
        )}
      </div>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden />
}
