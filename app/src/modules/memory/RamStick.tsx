import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { DemoTag, KTag } from '../../components/Tag'
import { IconCheck } from '../../components/icons'
import { isTerminal } from '../../stores/jobs'
import { useT } from '../../i18n'
import { kitDict } from '../../components/i18n'
import type { MemoryStick, SystemJob } from '../../types'
import { memDict } from './i18n'
import type { MemKey } from './i18n'
import './memory.css'

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

  return (
    <div role="group" aria-label={`${t('slot')} ${stick.slot}`} className={`ram-stick ${stick.ocupado ? '' : 'ram-stick--vazio'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="type-kicker truncate">
          {t('slot')} {stick.slot}
        </span>
        {stick.ocupado && (
          <>
            <KTag variant="ok">{tecnologia}</KTag>
            <span className="type-num ml-auto text-[11px] font-bold text-ink-2">{stick.velocidadeMhz} MHz</span>
          </>
        )}
      </div>

      {stick.ocupado ? (
        <>
          <div>
            <span className="ram-stick-cap">{stick.capacidadeGb} GB</span>
            <p className="mt-1 truncate text-[11px] text-ink-3" title={stick.partNumber ?? undefined}>
              {stick.partNumber ?? tk('naoDisponivel')}
              {stick.fabricante && ` · ${stick.fabricante}`}
            </p>
          </div>

          <ProgressBar pct={usagePct} showPct={false} />

          <div className="mt-auto min-h-[30px]" aria-live="polite">
            {running && job ? (
              <div>
                <p className="text-[11px] font-bold tracking-[0.06em] text-ink-2">
                  {job.etapaKey ? t(job.etapaKey as MemKey) : t('analisando')}
                </p>
                <ProgressBar pct={job.progressoPct} className="mt-1.5" />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="type-num text-[11px] text-ink-3">
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
                  <span className="stamp text-xs font-bold tracking-[0.06em] text-ink-1">{t('otimizado')}</span>
                  {demo && <DemoTag />}
                </div>
                <p className="mt-1 text-[10px] leading-tight text-ink-3">{t('otimizadoNota')}</p>
              </div>
            ) : job?.state === 'error' ? (
              <Button size="sm" variant="danger" onClick={onOptimize}>
                {t('falhouRepetir')}
              </Button>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold tracking-[0.06em] text-ink-3">
                  {job?.state === 'cancelled' ? t('cancelado') : ''}
                </span>
                <Button size="sm" onClick={onOptimize}>
                  {t('otimizar')}
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="my-auto text-center text-xs font-bold tracking-[0.08em] text-ink-4">{t('slotLivre')}</p>
      )}
    </div>
  )
}
