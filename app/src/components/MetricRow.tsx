import { useT } from '../i18n'
import type { DataOrigin } from '../types'
import { kitDict } from './i18n'
import { DemoTag, EstimatedTag } from './Tag'

/** Linha de dado: rótulo caps à esquerda, valor tabular à direita. Valor null = NÃO DISPONÍVEL. */
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
    <div className="flex min-h-8 items-center justify-between gap-4 border-b border-line px-0 py-1">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase shrink-0">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-2">
        {value !== null && origin === 'demo' && <DemoTag />}
        {value !== null && origin === 'estimated' && <EstimatedTag />}
        <span
          className={`type-num truncate text-right text-xs font-bold ${value === null ? 'text-ink-4' : accent ? 'text-signal' : 'text-ink-1'}`}
          title={value ?? undefined}
        >
          {value ?? t('naoDisponivel')}
        </span>
      </span>
    </div>
  )
}
