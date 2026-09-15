import { ChamferSurface } from './ChamferSurface'
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
  erro: <IconX className="text-signal" />,
  aviso: <IconWarn style={{ color: 'var(--color-heat)' }} />,
}

export function ToastCard({ kind, title, detail, actionLabel, onAction, onDismiss }: Props) {
  return (
    <ChamferSurface
      cut={6}
      className="toast-in w-80"
      edge={kind === 'erro' ? 'var(--color-signal)' : undefined}
      role="status"
    >
      <div className="flex items-start gap-3 p-3">
        {ICON[kind] && <span className="mt-0.5 shrink-0">{ICON[kind]}</span>}
        <div className="min-w-0 flex-1">
          <p className="type-mono text-xs font-bold tracking-[0.08em] text-ink-1">{title}</p>
          {detail && <p className="mt-1 text-xs leading-relaxed text-ink-3">{detail}</p>}
          {actionLabel && onAction && (
            <button
              className="type-mono mt-2 border border-edge px-2 py-1 text-[11px] font-bold tracking-[0.1em] text-ink-1 hover:border-signal"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          )}
        </div>
        <button aria-label="Fechar" className="shrink-0 text-ink-4 hover:text-ink-1" onClick={onDismiss}>
          <IconX width={12} height={12} />
        </button>
      </div>
    </ChamferSurface>
  )
}
