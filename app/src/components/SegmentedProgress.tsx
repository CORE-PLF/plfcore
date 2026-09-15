import './kit.css'

interface Props {
  /** 0..100; null = indeterminado (nunca spinner — blocos varrem) */
  pct: number | null
  segments?: number
  /** blocos acesos em --signal em vez de --heat */
  hot?: boolean
  showPct?: boolean
  className?: string
}

export function SegmentedProgress({ pct, segments = 30, hot = false, showPct = true, className = '' }: Props) {
  const lit = pct === null ? -1 : Math.round((pct / 100) * segments)
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="segprog flex-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        {Array.from({ length: segments }, (_, i) => (
          <i
            key={i}
            className={
              pct === null
                ? 'lit sweep'
                : i < lit
                  ? `lit ${hot ? 'hot' : ''}`
                  : ''
            }
            style={pct === null ? { animation: `skel-pulse 1s ease-in-out ${(i * 40) % 1000}ms infinite` } : undefined}
          />
        ))}
      </div>
      {showPct && pct !== null && (
        <span className="type-mono w-10 text-right text-xs font-bold text-ink-1">{Math.round(pct)}%</span>
      )}
    </div>
  )
}
