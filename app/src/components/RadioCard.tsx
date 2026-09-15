import { sfx } from '../services/sfx'
import './kit.css'

interface Props {
  checked: boolean
  onSelect: () => void
  title: string
  description: string
  badge?: string
}

export function RadioCard({ checked, onSelect, title, description, badge }: Props) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className="radiocard"
      onClick={() => {
        sfx.click()
        onSelect()
      }}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={`circle inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${checked ? 'border-signal bg-signal' : 'border-edge-2 bg-surface-2'}`}
          aria-hidden
        >
          {checked && <span className="circle block h-1.5 w-1.5 bg-void" />}
        </span>
        <span className="text-[13px] font-bold tracking-[0.02em] text-ink-1">{title}</span>
        {badge && <span className="tag ml-auto">{badge}</span>}
      </span>
      <span className="mt-1.5 block text-[11px] leading-relaxed text-ink-3">{description}</span>
    </button>
  )
}
