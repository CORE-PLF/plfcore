import './kit.css'

interface Props {
  /** 0..100; null = indeterminado (varredura, nunca spinner) */
  pct: number | null
  /** preenchimento vermelho (zona de perigo) */
  hot?: boolean
  showPct?: boolean
  className?: string
  /** legado */
  segments?: number
}

export function ProgressBar({ pct, hot = false, showPct = true, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="progress flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
        <i className={pct === null ? 'sweep' : hot ? 'hot' : ''} style={pct === null ? undefined : { width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      {showPct && pct !== null && (
        <span className="type-num w-10 text-right text-xs font-bold text-ink-1">{Math.round(pct)}%</span>
      )}
    </div>
  )
}
