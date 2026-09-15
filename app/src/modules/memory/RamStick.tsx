import type { CSSProperties } from 'react'
import { Surface } from '../../components/Surface'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { ScanLine } from '../../components/ScanLine'
import { DemoTag, KTag } from '../../components/Tag'
import { IconCheck } from '../../components/icons'
import { isTerminal } from '../../stores/jobs'
import { useT } from '../../i18n'
import { kitDict } from '../../components/i18n'
import type { MemoryStick, SystemJob } from '../../types'
import { memDict } from './i18n'
import type { MemKey } from './i18n'
import './memory.css'

const CHIPS = 8

function fmtMmSs(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

interface Props {
  stick: MemoryStick
  tecnologia: string
  /** uso de RAM do sistema 0..100; null antes da primeira amostra */
  usagePct: number | null
  job: SystemJob | undefined
  demo: boolean
  elapsedS: number
  /** já otimizado nesta sessão do app — só reabrindo o PLF CORE libera de novo */
  otimizado: boolean
  onOptimize: () => void
  onCancel: () => void
}

export function RamStick({
  stick,
  tecnologia,
  usagePct,
  job,
  demo,
  elapsedS,
  otimizado,
  onOptimize,
  onCancel,
}: Props) {
  const t = useT(memDict)
  const tk = useT(kitDict)
  const running = !!job && !isTerminal(job.state)
  const uso = stick.ocupado && usagePct !== null ? usagePct / 100 : 0

  return (
    <Surface
      cut={8}
      role="group"
      aria-label={`${t('slot')} ${stick.slot}`}
      className={`ram-stick ${stick.ocupado ? '' : 'ram-stick--vazio'}`}
    >
      <div className="ram-rust" aria-hidden />
      <div className="grid grid-cols-[230px_1fr_240px] items-center gap-5 px-4 py-3">
        <div>
          <p className="type-kicker truncate" title={stick.partNumber ?? undefined}>
            {t('slot')} {stick.slot} — {stick.ocupado ? (stick.partNumber ?? tk('naoDisponivel')) : t('slotLivre')}
          </p>
          {stick.ocupado ? (
            <>
              <p className="type-mono mt-1 text-2xl font-bold leading-none text-ink-1">
                {stick.capacidadeGb} GB
              </p>
              <p className="mt-1.5 flex items-center gap-2">
                <KTag variant="ok">{tecnologia}</KTag>
                <span className="type-mono text-xs font-bold text-ink-2">{stick.velocidadeMhz} MHz</span>
                {stick.fabricante && <span className="text-[11px] text-ink-3">{stick.fabricante}</span>}
              </p>
            </>
          ) : (
            <p className="type-display mt-1 text-xl text-ink-4">{t('slotLivre')}</p>
          )}
        </div>

        <div className={`ram-chips ${otimizado ? 'ram-chips--frio' : ''}`} aria-hidden>
          {Array.from({ length: CHIPS }, (_, i) => {
            const fill = Math.max(0, Math.min(1, uso * CHIPS - i))
            return (
              <span key={i} className="ram-chip" style={{ '--i': i } as CSSProperties}>
                <span
                  className={`heat ${fill > 0.12 ? 'on' : ''}`}
                  style={{ height: `${Math.round(fill * 100)}%` }}
                />
              </span>
            )
          })}
        </div>

        <div className="min-h-[44px]" aria-live="polite">
          {stick.ocupado &&
            (running && job ? (
              <div>
                <p className="type-mono text-[11px] font-bold tracking-[0.1em] text-ink-2">
                  {job.etapaKey ? t(job.etapaKey as MemKey) : t('analisando')}
                </p>
                <ProgressBar pct={job.progressoPct} segments={18} className="mt-1.5" />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="type-mono text-[11px] text-ink-3">
                    {tk('tempoDecorrido')} {fmtMmSs(elapsedS)}
                  </span>
                  {job.cancelavel && (
                    <Button size="sm" onClick={onCancel}>
                      {tk('cancelar')}
                    </Button>
                  )}
                </div>
              </div>
            ) : otimizado ? (
              <div>
                <div className="flex items-center gap-2">
                  <IconCheck className="text-ink-1" />
                  <span className="type-display stamp text-lg">{t('otimizado')}</span>
                  {demo && <DemoTag />}
                </div>
                <p className="type-mono mt-1 text-[10px] leading-tight text-ink-3">{t('otimizadoNota')}</p>
              </div>
            ) : job?.state === 'error' ? (
              <Button variant="danger" onClick={onOptimize}>
                {t('falhouRepetir')}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                {job?.state === 'cancelled' && (
                  <span className="type-mono text-[11px] font-bold tracking-[0.1em] text-ink-3">
                    {t('cancelado')}
                  </span>
                )}
                <Button onClick={onOptimize}>{t('otimizar')}</Button>
              </div>
            ))}
        </div>
      </div>
      <div className="ram-pins" aria-hidden />
      <ScanLine active={running} durationS={1.4} />
    </Surface>
  )
}
