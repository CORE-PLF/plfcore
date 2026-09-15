import { useEffect, useRef } from 'react'
import { Surface } from './Surface'
import { Button } from './Button'
import { ProgressBar } from './ProgressBar'
import { IconCheck } from './icons'
import { useT } from '../i18n'
import { kitDict } from './i18n'
import './kit.css'

interface ModalProps {
  open: boolean
  title: string
  onClose?: () => void
  children: React.ReactNode
  /** faixa hazard no topo (zona destrutiva) */
  danger?: boolean
  width?: number
}

export function Modal({ open, title, onClose, children, danger, width = 520 }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <Surface
        cut={12}
        allCorners
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width, maxWidth: 'calc(100vw - 48px)' }}
      >
        <div ref={ref} tabIndex={-1} className="modal-frame outline-none">
          {danger && <div className="hazard h-2 w-full shrink-0" aria-hidden />}
          <div className="modal-body p-6">
            <h2 className="type-display mb-4 text-2xl">{title}</h2>
            {children}
          </div>
        </div>
      </Surface>
    </div>
  )
}

interface ProgressModalProps {
  open: boolean
  title: string
  /** etapa atual nomeada (nunca spinner sem contexto) */
  step: string
  pct: number | null
  elapsedS: number
  cancellable: boolean
  onCancel?: () => void
}

export function ProgressModal({ open, title, step, pct, elapsedS, cancellable, onCancel }: ProgressModalProps) {
  const t = useT(kitDict)
  return (
    <Modal open={open} title={title}>
      <p className="type-mono mb-3 text-xs text-ink-2">{step}</p>
      <ProgressBar pct={pct} />
      <div className="mt-3 flex items-center justify-between">
        <span className="type-mono text-[11px] text-ink-3">
          {t('tempoDecorrido')} {Math.floor(elapsedS / 60).toString().padStart(2, '0')}:{Math.floor(elapsedS % 60).toString().padStart(2, '0')}
        </span>
        {cancellable && onCancel && (
          <Button size="sm" onClick={onCancel}>
            {t('cancelar')}
          </Button>
        )}
      </div>
    </Modal>
  )
}

interface ResultModalProps {
  open: boolean
  title: string
  /** microcópia do sucesso, ex.: "SISTEMA LIMPO" */
  headline: string
  lines?: Array<{ label: string; value: string }>
  onClose: () => void
  error?: boolean
}

export function ResultModal({ open, title, headline, lines = [], onClose, error }: ResultModalProps) {
  const t = useT(kitDict)
  return (
    <Modal open={open} title={title} onClose={onClose} danger={error}>
      <div className="mb-4 flex items-center gap-3">
        {!error && (
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2.5 8.5 6 12 13.5 4" stroke="var(--color-ink-1)" strokeWidth="1.5" className="check-draw" />
          </svg>
        )}
        <span className={`type-display stamp text-3xl ${error ? 'text-signal' : 'text-ink-1'}`}>{headline}</span>
      </div>
      {lines.length > 0 && (
        <dl className="mb-4">
          {lines.map((l) => (
            <div key={l.label} className="flex items-baseline justify-between border-b border-line py-1.5">
              <dt className="type-kicker">{l.label}</dt>
              <dd className="type-mono text-sm font-bold text-ink-1">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={onClose}>
          {t('fechar')}
        </Button>
      </div>
    </Modal>
  )
}

export { IconCheck }
