import { StatusLED } from './StatusLED'
import { Button } from './Button'
import { IconWarn } from './icons'
import { useT } from '../i18n'
import { kitDict } from './i18n'
import './kit.css'

/** Estado vazio: código + convite à ação, LED apagado. */
export function EmptyState({ code, message, action }: { code: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <StatusLED state="off" slow />
      <p className="type-num text-xs tracking-[0.14em] text-ink-3">{code}</p>
      <p className="max-w-sm text-sm text-ink-2">{message}</p>
      {action}
    </div>
  )
}

/** Erro: vermelho + ícone (nunca só cor) + o que fazer. */
export function ErrorState({ what, todo, onRetry }: { what: string; todo: string; onRetry?: () => void }) {
  const t = useT(kitDict)
  return (
    <div className="rounded-[10px] border border-blood bg-[var(--danger-soft)] p-4">
      <p className="flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-[#ff8a8f]">
        <IconWarn width={14} height={14} /> {what}
      </p>
      <p className="mt-1 text-sm text-ink-2">{todo}</p>
      {onRetry && (
        <Button size="sm" variant="danger" className="mt-3" onClick={onRetry}>
          {t('tentarNovamente')}
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden />
}
