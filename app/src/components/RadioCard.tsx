import { Surface } from './Surface'
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
    <Surface cut={6} brackets={checked} edge={checked ? 'var(--color-rust)' : undefined} className="w-full">
      <button
        role="radio"
        aria-checked={checked}
        className="radiocard w-full bg-transparent"
        onClick={() => {
          sfx.click()
          onSelect()
        }}
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 border ${checked ? 'border-signal bg-signal' : 'border-ink-4'}`}
            style={{ clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)' }}
            aria-hidden
          />
          <span className="type-display text-base">{title}</span>
          {badge && <span className="tag tag--estimated ml-auto">{badge}</span>}
        </span>
        <span className="mt-1.5 block text-xs leading-relaxed text-ink-3">{description}</span>
      </button>
    </Surface>
  )
}
