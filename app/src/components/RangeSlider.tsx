import './kit.css'

interface Props {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  /** rótulo vivo que muda com o valor */
  liveLabel: string
  ariaLabel: string
  leftCaption?: string
  rightCaption?: string
}

export function RangeSlider({ value, onChange, min = 0, max = 100, step = 25, liveLabel, ariaLabel, leftCaption, rightCaption }: Props) {
  return (
    <div>
      <p className="type-num mb-1 text-[11px] font-bold tracking-[0.06em] text-ink-1 uppercase" aria-live="polite">
        {liveLabel}
      </p>
      <input
        type="range"
        className="pfx-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={liveLabel}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {(leftCaption || rightCaption) && (
        <div className="mt-1 flex justify-between">
          <span className="type-kicker">{leftCaption}</span>
          <span className="type-kicker">{rightCaption}</span>
        </div>
      )}
    </div>
  )
}
