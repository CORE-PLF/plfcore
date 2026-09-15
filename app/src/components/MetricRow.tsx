import { useT } from '../i18n'
import type { DataOrigin } from '../types'
import { kitDict } from './i18n'
import { DemoTag, EstimatedTag } from './Tag'

/** Linha de dado denso: rótulo caps + valor mono. Valor null = NÃO DISPONÍVEL. */
export function MetricRow({
  label,
  value,
  accent,
  origin,
}: {
  label: string
  value: string | null
  accent?: boolean
  origin?: DataOrigin | null
}) {
  const t = useT(kitDict)
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-[5px]">
      <span className="type-kicker shrink-0">{label}</span>
      <span className="flex min-w-0 items-baseline justify-end gap-2">
        {value !== null && origin === 'demo' && <DemoTag />}
        {value !== null && origin === 'estimated' && <EstimatedTag />}
        <span
          className={`type-mono truncate text-right text-xs font-bold ${value === null ? 'text-ink-4' : accent ? 'text-signal' : 'text-ink-1'}`}
          title={value ?? undefined}
        >
          {value ?? t('naoDisponivel')}
        </span>
      </span>
    </div>
  )
}
