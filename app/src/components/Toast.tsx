import { Surface } from './Surface'
import { IconCheck, IconWarn, IconX } from './icons'
import './kit.css'

export type ToastKind = 'info' | 'sucesso' | 'erro' | 'aviso'

interface Props {
  kind: ToastKind
  title: string
  detail?: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
}

const ICON: Record<ToastKind, React.ReactNode> = {
  info: null,
  sucesso: <IconCheck className="text-ink-1" />,
  erro: <IconX className="text-blood" />,
  aviso: <IconWarn className="text-signal" />,
}

export function ToastCard({ kind, title, detail, actionLabel, onAction, onDismiss }: Props) {
  return (
    <Surface className="toast-in w-80" edge={kind === 'erro' ? 'var(--color-blood)' : undefined} role="status">
      <div className="flex items-start gap-3 p-3">
        {ICON[kind] && <span className="mt-0.5 shrink-0">{ICON[kind]}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.04em] text-ink-1">{title}</p>
          {detail && <p className="mt-1 text-xs leading-relaxed text-ink-3">{detail}</p>}
          {actionLabel && onAction && (
            <button className="btn btn--sm mt-2" onClick={onAction}>
              {actionLabel}
            </button>
          )}
        </div>
        <button aria-label="Fechar" className="shrink-0 text-ink-4 hover:text-ink-1" onClick={onDismiss}>
          <IconX width={12} height={12} />
        </button>
      </div>
    </Surface>
  )
}
