import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ChamferSurface } from '../../components/ChamferSurface'
import { Button } from '../../components/Button'
import { HoldButton } from '../../components/HoldButton'
import { SegmentedProgress } from '../../components/SegmentedProgress'
import { StatusLED } from '../../components/StatusLED'
import { ScanLine } from '../../components/ScanLine'
import { Modal } from '../../components/Modal'
import { MetricRow } from '../../components/MetricRow'
import { ScreenTitle } from '../../components/Kicker'
import { EmptyState } from '../../components/states'
import { IconCheck, IconMinus, IconWarn, IconX } from '../../components/icons'
import { useT } from '../../i18n'
import { kitDict } from '../../components/i18n'
import { shellDict } from '../../shell/i18n'
import {
  isTerminal,
  selectFila,
  selectHistorico,
  selectJobAtivo,
  useJobsStore,
} from '../../stores/jobs'
import { useLogStore } from '../../stores/log'
import { useKillfeedStore } from '../../stores/killfeed'
import { useToastsStore } from '../../stores/toasts'
import type { JobState, SystemJob } from '../../types'
import { stopDict } from './i18n'

type Fase = 'interrompendo' | 'cancelada' | 'restaurando' | 'restaurada' | null

const NAV_IDS: ReadonlyArray<string> = [
  'cockpit', 'xray', 'memory', 'cleanup', 'windows', 'latency', 'bottleneck', 'stop', 'settings', 'log',
]
const ESTADOS_VIVOS: ReadonlyArray<string> = ['preparing', 'scanning', 'running', 'applying']
const ETAPA_RESTAURO = 'stop.etapa.restaurar'
const RESTAURO_MS = 2400

const pad = (n: number): string => String(n).padStart(2, '0')
const fmtDecorrido = (s: number): string => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`
const fmtRelogio = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const HIST_ICONE: Partial<Record<JobState, typeof IconCheck>> = {
  success: IconCheck,
  warning: IconWarn,
  error: IconX,
  cancelled: IconMinus,
}
const HIST_CLS: Partial<Record<JobState, string>> = {
  success: 'text-ink-1',
  warning: 'text-heat',
  error: 'tag--critical',
  cancelled: 'text-ink-3',
}

/** Restauração simulada como job — timers em escopo de módulo: sobrevive a navegação. */
function simularRestauracao(alvo: string, moduloOrigem: string, aoTerminar: () => void): void {
  const jobs = useJobsStore.getState()
  const id = jobs.startJob({
    moduloId: 'stop',
    tituloKey: 'stop.job.restaurar',
    etapas: [ETAPA_RESTAURO],
    cancelavel: false,
  })
  jobs.advanceState(id, 'running', ETAPA_RESTAURO)
  const inicio = Date.now()
  const timer = window.setInterval(() => {
    const pct = Math.min(100, ((Date.now() - inicio) / RESTAURO_MS) * 100)
    useJobsStore.getState().updateJob(id, { progressoPct: pct })
    if (pct >= 100) {
      window.clearInterval(timer)
      useJobsStore.getState().finishJob(id, 'estado-restaurado')
      const logId = useLogStore.getState().log({
        moduloId: 'stop',
        acao: 'restaurar-estado',
        resultado: 'ok',
        reversivel: false,
        detalhes: moduloOrigem,
      })
      useKillfeedStore.getState().push({ alvo, acao: 'revertido', quantidade: null, logId })
      aoTerminar()
    }
  }, 120)
}

/** Cancela de verdade na hora; a sequência de fases é só exibição. */
function executarStop(
  job: SystemJob,
  alvo: string,
  reversivel: boolean,
  onFase: (f: Exclude<Fase, null>, final: boolean) => void,
): void {
  useJobsStore.getState().cancelJob(job.id)
  const logId = useLogStore.getState().log({
    moduloId: 'stop',
    acao: 'stoppar-operacao',
    resultado: 'cancelada',
    reversivel: false,
    detalhes: job.etapaKey ? `${job.moduloId} / ${job.etapaKey}` : job.moduloId,
  })
  useKillfeedStore.getState().push({ alvo, acao: 'parado', quantidade: null, logId })
  onFase('interrompendo', false)
  window.setTimeout(() => {
    onFase('cancelada', !reversivel)
    if (!reversivel) return
    window.setTimeout(() => {
      onFase('restaurando', false)
      simularRestauracao(alvo, job.moduloId, () => onFase('restaurada', true))
    }, 500)
  }, 600)
}

export default function StopScreen() {
  const t = useT(stopDict)
  const tk = useT(kitDict)
  const ts = useT(shellDict)

  const jobAtivo = useJobsStore(selectJobAtivo)
  const fila = useJobsStore(useShallow(selectFila))
  const historico = useJobsStore(useShallow(selectHistorico))
  const jobRestauro = useJobsStore((s) =>
    s.jobs.find((j) => j.moduloId === 'stop' && !isTerminal(j.state)),
  )

  const [confirmar, setConfirmar] = useState(false)
  const [alvoId, setAlvoId] = useState<string | null>(null)
  const [fase, setFase] = useState<Fase>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const vivo = useRef(true)
  const limpezaFase = useRef(0)

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      window.clearTimeout(limpezaFase.current)
    }
  }, [])

  const ativoId = jobAtivo?.id
  useEffect(() => {
    if (!ativoId) return
    setAgora(Date.now())
    const id = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [ativoId])

  const rotuloModulo = (moduloId: string): string =>
    NAV_IDS.includes(moduloId) ? ts(`nav.${moduloId as 'stop'}` as const) : moduloId.toUpperCase()

  const rotuloEstado = (s: JobState): string => {
    if (ESTADOS_VIVOS.includes(s)) return ts(`job.state.${s as 'running'}` as const)
    if (s === 'success') return t('histSuccess')
    if (s === 'warning') return t('histWarning')
    if (s === 'error') return t('histError')
    if (s === 'cancelled') return t('histCancelled')
    return s.toUpperCase()
  }

  // Etapa de outro módulo: id técnico (o dict dela pertence à tela dona do job).
  const rotuloEtapa = (j: SystemJob): string | null =>
    j.etapaKey === ETAPA_RESTAURO ? t('etapaRestaurar') : j.etapaKey

  const onFase = (f: Exclude<Fase, null>, final: boolean): void => {
    if (!vivo.current) return
    setFase(f)
    if (final) {
      window.clearTimeout(limpezaFase.current)
      limpezaFase.current = window.setTimeout(() => {
        if (vivo.current) setFase(null)
      }, 4000)
    }
  }

  const abrirConfirmacao = (): void => {
    if (!jobAtivo?.cancelavel) return
    setAlvoId(jobAtivo.id)
    setConfirmar(true)
  }

  const jobAlvo = useJobsStore((s) => (alvoId ? s.jobs.find((j) => j.id === alvoId) : undefined))
  const alvoReversivel = jobAlvo?.state === 'applying'

  const confirmarStop = (): void => {
    setConfirmar(false)
    const job = alvoId ? useJobsStore.getState().jobs.find((j) => j.id === alvoId) : undefined
    if (!job || isTerminal(job.state)) {
      useToastsStore.getState().push({ tipo: 'aviso', mensagem: t('jaConcluida') })
      return
    }
    executarStop(job, rotuloModulo(job.moduloId), job.state === 'applying', onFase)
  }

  return (
    <div className="p-8">
      <ScreenTitle kicker={t('kicker')} title={t('title')} />

      <div className="grid max-w-[1180px] grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start gap-6">
        {/* ── coluna de dados ─────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-6">
          <ChamferSurface cut={8} className="relative">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <span className="type-kicker">{t('opAtual')}</span>
                {jobAtivo && <StatusLED state="heat" label={rotuloEstado(jobAtivo.state)} />}
              </div>
              {jobAtivo ? (
                <>
                  <p className="type-display mt-3 text-3xl">{rotuloModulo(jobAtivo.moduloId)}</p>
                  <div className="mt-3">
                    <MetricRow label={t('etapa')} value={rotuloEtapa(jobAtivo)} />
                    <MetricRow label={t('estado')} value={rotuloEstado(jobAtivo.state)} />
                    <MetricRow
                      label={t('tempo')}
                      value={fmtDecorrido(Math.max(0, (agora - jobAtivo.inicioMs) / 1000))}
                    />
                  </div>
                  <div className="mt-4">
                    <span className="type-kicker">{t('progresso')}</span>
                    <SegmentedProgress pct={jobAtivo.progressoPct} className="mt-2" />
                  </div>
                </>
              ) : (
                <EmptyState code={t('vazioCode')} message={t('vazioMsg')} />
              )}
            </div>
            {jobAtivo && <ScanLine durationS={2.6} />}
          </ChamferSurface>

          <ChamferSurface cut={6} flat>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <span className="type-kicker">{t('fila')}</span>
                <span className="type-mono text-xs font-bold text-ink-3">{fila.length}</span>
              </div>
              {fila.length === 0 ? (
                <p className="type-mono mt-3 text-[11px] tracking-[0.1em] text-ink-4">{t('filaVazia')}</p>
              ) : (
                <ol className="mt-2">
                  {fila.map((j, i) => (
                    <li key={j.id} className="flex items-center gap-3 border-b border-line py-[5px]">
                      <span className="type-mono text-[11px] text-ink-4">{pad(i + 1)}</span>
                      <span className="type-mono min-w-0 flex-1 truncate text-xs font-bold text-ink-2">
                        {rotuloModulo(j.moduloId)}
                      </span>
                      <span className="tag text-ink-3">{t('naFila')}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </ChamferSurface>

          <ChamferSurface cut={6} flat>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <span className="type-kicker">{t('historico')}</span>
                <span className="type-mono text-xs font-bold text-ink-3">{historico.length}</span>
              </div>
              {historico.length === 0 ? (
                <p className="type-mono mt-3 text-[11px] tracking-[0.1em] text-ink-4">{t('historicoVazio')}</p>
              ) : (
                <ul className="scanlines mt-2 max-h-72 overflow-y-auto">
                  {historico.map((j) => {
                    const Icone = HIST_ICONE[j.state] ?? IconMinus
                    return (
                      <li key={j.id} className="flex items-center gap-3 border-b border-line py-1.5">
                        <span className="type-mono text-[11px] text-ink-4">
                          {fmtRelogio(j.inicioMs + (j.duracaoMs ?? 0))}
                        </span>
                        <span className="type-mono min-w-0 flex-1 truncate text-xs font-bold text-ink-2">
                          {rotuloModulo(j.moduloId)}
                        </span>
                        <span className="type-mono w-16 text-right text-[11px] text-ink-3">
                          {j.duracaoMs !== null ? `${(j.duracaoMs / 1000).toFixed(1)}s` : '—'}
                        </span>
                        <span className={`tag ${HIST_CLS[j.state] ?? 'text-ink-3'}`}>
                          <Icone width={10} height={10} />
                          {rotuloEstado(j.state)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </ChamferSurface>
        </div>

        {/* ── zona de interrupção (elemento dominante) ────────────────── */}
        <ChamferSurface cut={12} allCorners brackets className="min-h-[420px]">
          <div className="flex h-full min-h-[420px] flex-col">
            <div className="hazard h-2 w-full" aria-hidden />
            <div className="flex flex-1 flex-col gap-5 p-6">
              <div className="flex items-center justify-between">
                <span className="type-kicker">{t('zona')}</span>
                {jobAtivo && !fase && <StatusLED state="live" />}
              </div>

              {fase ? (
                <div
                  className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
                  aria-live="polite"
                >
                  {fase === 'interrompendo' && (
                    <>
                      <StatusLED state="heat" />
                      <p className="type-display text-3xl" style={{ color: 'var(--color-heat)' }}>
                        {t('stInterrompendo')}
                      </p>
                    </>
                  )}
                  {fase === 'cancelada' && (
                    <>
                      <IconMinus width={24} height={24} className="text-ink-3" />
                      <p className="type-display stamp text-3xl" style={{ color: 'var(--color-ink-3)' }}>
                        {t('stCancelada')}
                      </p>
                    </>
                  )}
                  {fase === 'restaurando' && (
                    <>
                      <p className="type-display text-3xl">{t('stRestaurando')}</p>
                      <SegmentedProgress pct={jobRestauro?.progressoPct ?? null} className="w-full" />
                    </>
                  )}
                  {fase === 'restaurada' && (
                    <>
                      <IconCheck width={24} height={24} className="text-ink-1" />
                      <p className="type-display stamp text-3xl">{t('stRestaurada')}</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm text-ink-2">{t('zonaDesc')}</p>
                  {jobAtivo && !jobAtivo.cancelavel && (
                    <div role="status" className="flex items-start gap-2 border border-heat/60 bg-heat/10 p-3">
                      <IconWarn width={16} height={16} className="mt-0.5 shrink-0 text-heat" />
                      <div className="min-w-0">
                        <p className="type-mono text-xs font-bold tracking-[0.08em] text-heat">
                          {t('insegura')}
                        </p>
                        <p className="mt-1 text-xs text-ink-2">{t('inseguraDesc')}</p>
                      </div>
                    </div>
                  )}
                  <div className="mt-auto">
                    <div className="hazard p-3">
                      <Button
                        variant="primary"
                        className="min-h-[64px] w-full text-xl"
                        disabled={!jobAtivo?.cancelavel}
                        onClick={abrirConfirmacao}
                      >
                        <IconX width={18} height={18} />
                        {t('stopBtn')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </ChamferSurface>
      </div>

      <Modal open={confirmar} title={t('stopBtn')} danger onClose={() => setConfirmar(false)}>
        <div className="flex items-start gap-3">
          <IconWarn width={20} height={20} className="mt-0.5 shrink-0 text-signal" />
          <p className="text-sm text-ink-2">
            {t('consequencia', { modulo: jobAlvo ? rotuloModulo(jobAlvo.moduloId) : '—' })}
          </p>
        </div>
        <p className={`type-mono mt-3 text-xs font-bold ${alvoReversivel ? 'text-ink-1' : 'text-ink-3'}`}>
          {alvoReversivel ? t('reversivel') : t('semMudancas')}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <HoldButton onConfirm={confirmarStop} className="min-h-[52px] w-full">
            {t('stopBtn')}
          </HoldButton>
          <p className="type-mono text-center text-[10px] tracking-[0.14em] text-ink-4">
            {tk('segureParaConfirmar')}
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setConfirmar(false)}>
              {tk('cancelar')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
