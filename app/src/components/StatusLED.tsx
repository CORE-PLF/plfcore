import './kit.css'

interface Props {
  state: 'live' | 'heat' | 'white' | 'off'
  /** respiração lenta (estado ocioso) */
  slow?: boolean
  label?: string
  className?: string
}

export function StatusLED({ state, slow, label, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`led circle led--${state} ${slow ? 'led--slow' : ''}`} aria-hidden />
      {label && (
        <span className="text-[11px] font-bold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      )}
    </span>
  )
}
