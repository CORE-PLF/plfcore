import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { Gauge } from '../../components/Gauge'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { Modal } from '../../components/Modal'
import { ProgressBar } from '../../components/ProgressBar'
import { DemoTag, EstimatedTag } from '../../components/Tag'
import { kitDict } from '../../components/i18n'
import { IconCheck, IconChevron, IconWarn, IconX } from '../../components/icons'
import { ErrorState, Skeleton } from '../../components/states'
import { t as tr, useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { getInventoryCached } from '../../services/inventoryCache'
import { registerRevert, useLogStore } from '../../stores/log'
import { isTerminal, useJobsStore } from '../../stores/jobs'
import { useKillfeedStore } from '../../stores/killfeed'
import type { OptimizationResult } from '../../services/SystemAdapter'
import type { BottleneckResult, HardwareInventory, JobState, SystemMetrics } from '../../types'
import { dict } from './i18n'
import type { BnKey } from './i18n'
import './index.css'

const ETAPA_KEY = {
  'coleta-cpu': 'etapaColetaCpu',
  'coleta-gpu': 'etapaColetaGpu',
  'coleta-ram': 'etapaColetaRam',
  analise: 'etapaAnalise',
  'plano-energia': 'etapaPlanoEnergia',
  servicos: 'etapaServicos',
  registro: 'etapaRegistro',
  verificacao: 'etapaVerificacao',
} as const

const STATE_KEY: Partial<Record<JobState, BnKey>> = {
  preparing: 'estadoPreparando',
  scanning: 'estadoVarrendo',
  running: 'estadoExecutando',
  applying: 'estadoAplicando',
}

const ALTERACAO_KEY: Record<string, BnKey> = {
  'plano-energia-alto': 'acaoPlanoEnergia',
  'servicos-nao-essenciais': 'acaoServicos',
  'game-mode-registro': 'acaoGameMode',
}

const mmss = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`

function useElapsedS(startMs: number | null): number {
  const [s, setS] = useState(0)
  useEffect(() => {
    if (startMs === null) return
    setS(Math.floor((Date.now() - startMs) / 1000))
    const id = setInterval(() => setS(Math.floor((Date.now() - startMs) / 1000)), 500)
    return () => clearInterval(id)
  }, [startMs])
  return s
}

/** Etapa nomeada + barra + % + tempo decorrido de um job vivo. */
function JobProgress({ jobId }: { jobId: string | null }) {
  const t = useT(dict)
  const tk = useT(kitDict)
  const job = useJobsStore((s) => s.jobs.find((j) => j.id === jobId))
  const ativo = !!job && !isTerminal(job.state)
  const elapsed = useElapsedS(ativo ? job.inicioMs : null)
  if (!job || !ativo) return null
  const stateKey = STATE_KEY[job.state]
  const etapaKey =
    job.etapaKey && job.etapaKey in ETAPA_KEY
      ? ETAPA_KEY[job.etapaKey as keyof typeof ETAPA_KEY]
      : null
  return (
    <div aria-live="polite">
      <p className="text-xs font-bold tracking-[0.1em] text-ink-2">
        {stateKey ? t(stateKey) : ''}
        {etapaKey ? ` — ${t(etapaKey)}` : ''}
      </p>
      <ProgressBar pct={job.progressoPct} className="mt-3" />
      <p className="type-num mt-3 text-[11px] text-ink-3">
        {tk('tempoDecorrido')} {mmss(elapsed)}
      </p>
    </div>
  )
}

/** Feixe entre CPU e GPU: espessura de cada lado ∝ uso ao vivo; amarelo quando há gargalo medido. */
function FlowBeam({ cpu, gpu, hot }: { cpu: number | null; gpu: number | null; hot: boolean }) {
  const W = 220
  const H = 140
  const MID = H / 2
  const half = (v: number | null) => 5 + ((v ?? 0) / 100) * 48
  const l = half(cpu)
  const r = half(gpu)
  const LINES = 5
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`bn-flow ${hot ? 'bn-flow--hot' : ''}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={`0,${MID - l} ${W},${MID - r} ${W},${MID + r} 0,${MID + l}`} className="bn-flowfill" />
      {Array.from({ length: LINES }, (_, i) => {
        const f = i / (LINES - 1) - 0.5
        return (
          <line
            key={i}
            x1={0}
            y1={MID + 2 * f * l}
            x2={W}
            y2={MID + 2 * f * r}
            className="bn-flowline"
            style={{ animationDelay: `${i * -180}ms` }}
          />
        )
      })}
    </svg>
  )
}

/** Linha de dado: rótulo caps à esquerda, valor tabular à direita. null = NÃO DISPONÍVEL. */
function DataRow({ label, value, origin }: { label: string; value: string | null; origin?: SystemMetrics['cpuTempOrigin'] }) {
  const tk = useT(kitDict)
  return (
    <div className="datarow">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {value !== null && origin === 'demo' && <DemoTag />}
        <span className={`type-num truncate text-xs font-bold ${value === null ? 'text-ink-4' : 'text-ink-1'}`}>
          {value ?? tk('naoDisponivel')}
        </span>
      </span>
    </div>
  )
}

function ChipCard({
  tag,
  nome,
  uso,
  carregando,
  rows,
}: {
  tag: string
  nome: string | null
  uso: number | null
  carregando: boolean
  rows: Array<{ label: string; value: string | null; origin?: SystemMetrics['cpuTempOrigin'] }>
}) {
  const t = useT(dict)
  const tk = useT(kitDict)
  return (
    <Surface className="overflow-hidden">
      <div className="surface-head" style={{ minHeight: 40, padding: '0 14px' }}>
        {tag}
      </div>
      <div className="flex gap-3 p-[14px]">
        <div className="w-[42%] min-w-[96px] max-w-[150px] shrink-0">
          <Gauge value={uso} label={tag} showLabel={false} fluid />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold tracking-[0.14em] text-ink-3">{t('usoAgora')}</span>
            {uso === null ? (
              <span className="block text-[20px] font-bold leading-[1.05] text-ink-4">{tk('naoDisponivel')}</span>
            ) : (
              <span className="type-num block text-[clamp(28px,2.6vw,40px)] font-bold leading-[1.05] text-ink-1">{Math.round(uso)}%</span>
            )}
            {carregando ? (
              <Skeleton className="mt-1 h-3 w-3/4" />
            ) : (
              <span className={`block truncate text-[11px] ${nome ? 'text-ink-3' : 'text-ink-4'}`} title={nome ?? undefined}>
                {nome ?? tk('naoDisponivel')}
              </span>
            )}
          </div>
          <div className="mt-auto flex flex-col gap-px overflow-hidden rounded-[6px]">
            {rows.map((r) => (
              <DataRow key={r.label} label={r.label} value={r.value} origin={r.origin} />
            ))}
          </div>
        </div>
      </div>
    </Surface>
  )
}

function CheckHeadline({ text }: { text: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M2.5 8.5 6 12 13.5 4"
          stroke="var(--color-ink-1)"
          strokeWidth="1.5"
          className="check-draw"
        />
      </svg>
      <span className="stamp text-[28px] font-bold tracking-[-0.02em] text-ink-1">{text}</span>
    </div>
  )
}

function BoostFeito({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="mt-5">
      <CheckHeadline text={titulo} />
      <p className="max-w-md text-xs leading-5 text-ink-3">{nota}</p>
    </div>
  )
}

type FaseModal = 'confirm' | 'run' | 'done' | 'error'

/** Sobrevive à troca de tela e morre quando o app fecha: depois do BOOST a tela
 *  vira "já feito" e só reabrindo o PLF CORE dá para medir e aplicar de novo. */
const sessao: {
  feito: boolean
  resultado: BottleneckResult | null
  medicao: { antes: number; depois: number; reducaoPct: number } | null
} = { feito: false, resultado: null, medicao: null }

export default function BottleneckScreen() {
  const t = useT(dict)
  const tk = useT(kitDict)

  const [inv, setInv] = useState<HardwareInventory | null>(null)
  const [invErro, setInvErro] = useState(false)
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)

  const [medindo, setMedindo] = useState(false)
  const [medirJobId, setMedirJobId] = useState<string | null>(null)
  const [medirErro, setMedirErro] = useState(false)
  const [resultado, setResultado] = useState<BottleneckResult | null>(sessao.resultado)

  const [reduzOpen, setReduzOpen] = useState(false)
  const [reduzFase, setReduzFase] = useState<FaseModal>('confirm')
  const [reduzJobId, setReduzJobId] = useState<string | null>(null)
  const [reduzido, setReduzido] = useState<{ antes: number; depois: number } | null>(null)

  const [boostOpen, setBoostOpen] = useState(false)
  const [boostFase, setBoostFase] = useState<Exclude<FaseModal, 'confirm'>>('run')
  const [boostRes, setBoostRes] = useState<OptimizationResult | null>(null)
  const [boostFeito, setBoostFeito] = useState(sessao.feito)
  const [boostMedicao, setBoostMedicao] = useState<{
    antes: number
    depois: number
    reducaoPct: number
  } | null>(sessao.medicao)
  const [boostPct, setBoostPct] = useState(0)
  const [boostEtapa, setBoostEtapa] = useState<'boostEtapaBaseline' | 'boostEtapaAplicacao' | 'boostEtapaVerificacao'>('boostEtapaBaseline')
  const [boostMedicaoFalhou, setBoostMedicaoFalhou] = useState(false)
  const [applyErro, setApplyErro] = useState<string | null>(null)

  const jobAtivo = useJobsStore((s) =>
    s.jobs.some((j) => j.moduloId === 'bottleneck' && !isTerminal(j.state)),
  )

  useEffect(() => {
    let vivo = true
    getInventoryCached()
      .then((i) => vivo && setInv(i))
      .catch(() => vivo && setInvErro(true))
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => getAdapter().streamMetrics(setMetrics), [])

  const demo = inv?.origin === 'demo' || metrics?.origin === 'demo'

  async function medir() {
    setMedirErro(false)
    setResultado(null)
    setReduzido(null)
    setMedindo(true)
    const jobs = useJobsStore.getState()
    const adapter = getAdapter()
    const id = jobs.startJob({ moduloId: 'bottleneck', tituloKey: 'bottleneck.job.medir' })
    setMedirJobId(id)
    try {
      const res = await adapter.measureBottleneck((pct, etapaId) => {
        jobs.advanceState(id, etapaId === 'analise' ? 'running' : 'scanning')
        jobs.updateJob(id, { progressoPct: pct, etapaKey: etapaId })
      })
      jobs.finishJob(id, res.pctEstimado === null ? t('semCargaCurto') : `${res.pctEstimado}%`)
      setResultado(res)
    } catch {
      jobs.failJob(id, 'measure-failed')
      setMedirErro(true)
    } finally {
      setMedindo(false)
    }
  }

  async function aplicarPerfil(
    profileId: 'reduzir-gargalo' | 'boost-seguro',
    tituloKey: string,
    perfilKey: BnKey,
    onProgress?: (pct: number) => void,
  ): Promise<OptimizationResult> {
    const jobs = useJobsStore.getState()
    const adapter = getAdapter()
    const id = jobs.startJob({ moduloId: 'bottleneck', tituloKey })
    if (profileId === 'reduzir-gargalo') setReduzJobId(id)
    try {
      const res = await adapter.applyOptimization(profileId, (pct, etapaId) => {
        jobs.advanceState(id, 'applying')
        jobs.updateJob(id, { progressoPct: pct, etapaKey: etapaId })
        onProgress?.(pct)
      })
      const logId = useLogStore.getState().log({
        moduloId: 'bottleneck',
        acao: profileId,
        resultado: 'ok',
        reversivel: true,
        detalhes: `[${res.origin}] ${res.alteracoesIds.join(',')}`,
      })
      registerRevert(logId, async () => {
        await adapter.revertOptimization()
        useKillfeedStore
          .getState()
          .push({ alvo: tr(dict, perfilKey), acao: 'revertido', quantidade: null, logId })
      })
      if (res.alteracoesIds.includes('servicos-nao-essenciais')) {
        useKillfeedStore
          .getState()
          .push({ alvo: tr(dict, 'acaoServicos'), acao: 'parado', quantidade: null, logId })
      }
      jobs.finishJob(id, res.alteracoesIds.join(','))
      return res
    } catch (e) {
      jobs.failJob(id, 'apply-failed')
      throw e
    }
  }

  async function aplicarReducao() {
    if (!resultado || resultado.pctProjetado === null || resultado.pctEstimado === null) return
    const antes = resultado.pctEstimado
    setApplyErro(null)
    setReduzFase('run')
    try {
      await aplicarPerfil('reduzir-gargalo', 'bottleneck.job.reduzir', 'perfilReducao')
      setReduzido({ antes, depois: resultado.pctProjetado })
      setReduzFase('done')
    } catch (error) {
      setApplyErro(error instanceof Error ? error.message : 'ERR_OPT_APPLY')
      setReduzFase('error')
    }
  }

  function marcarFeito() {
    sessao.feito = true
    setBoostFeito(true)
  }

  async function aplicarBoost() {
    setBoostOpen(true)
    setBoostFase('run')
    setBoostRes(null)
    setBoostMedicao(null)
    setBoostMedicaoFalhou(false)
    setBoostPct(0)
    setBoostEtapa('boostEtapaBaseline')
    setApplyErro(null)
    const adapter = getAdapter()
    let aplicado: OptimizationResult | null = null
    try {
      const antes = await adapter.measureBottleneck((pct) => setBoostPct(Math.round(pct * 0.35)))
      setResultado(antes)
      setBoostEtapa('boostEtapaAplicacao')
      aplicado = await aplicarPerfil(
        'boost-seguro',
        'bottleneck.job.boost',
        'perfilBoost',
        (pct) => setBoostPct(35 + Math.round(pct * 0.3)),
      )
      setBoostRes(aplicado)
      setBoostEtapa('boostEtapaVerificacao')
      const depois = await adapter.measureBottleneck((pct) => setBoostPct(65 + Math.round(pct * 0.35)))
      setResultado(depois)
      // O antes/depois é o que as duas medições devolveram. Sem as duas, o painel
      // diz que não deu para verificar — nunca estima a melhora por conta própria.
      if (antes.pctEstimado === null || depois.pctEstimado === null) {
        setBoostMedicaoFalhou(true)
      } else {
        const pp = antes.pctEstimado - depois.pctEstimado
        sessao.medicao = {
          antes: antes.pctEstimado,
          depois: depois.pctEstimado,
          reducaoPct: antes.pctEstimado > 0 ? Math.round((pp / antes.pctEstimado) * 100) : 0,
        }
        setBoostMedicao(sessao.medicao)
      }
      sessao.resultado = depois
      setBoostPct(100)
      setBoostFase('done')
      marcarFeito()
    } catch (error) {
      if (aplicado) {
        setBoostRes(aplicado)
        setBoostMedicaoFalhou(true)
        setBoostFase('done')
        marcarFeito()
      } else {
        setApplyErro(error instanceof Error ? error.message : 'ERR_OPT_APPLY')
        setBoostFase('error')
      }
    }
  }

  const linhaReducao = (r: { antes: number; depois: number }) =>
    t('reducaoLinha', { antes: r.antes, depois: r.depois, pp: r.antes - r.depois })

  const linhaBoost = (r: { antes: number; depois: number; reducaoPct: number }) => {
    const pp = r.antes - r.depois
    if (pp <= 0 || r.antes <= 0) return t('boostSemReducaoLinha', { antes: r.antes, depois: r.depois })
    return t('boostReducaoLinha', {
      antes: r.antes,
      depois: r.depois,
      pp,
      rel: r.reducaoPct,
    })
  }

  const garantias: BnKey[] = ['boostSem1', 'boostSem2', 'boostSem3']

  return (
    <div className="h-full overflow-y-auto p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} meta={t('meta')} actions={demo ? <DemoTag full /> : undefined} />

      {/* ===== hero: veredito + boost ===== */}
      <div className="grid gap-4 grid-cols-[2fr_1fr]">
        <Surface className="overflow-hidden" aria-live="polite">
          <div className="surface-head">
            <span>{t('resultadoTitulo')}</span>
            {resultado?.origin === 'demo' && <span className="tag tag--demo ml-auto">{t('demoResultado')}</span>}
          </div>
          <div className="p-5">
            {medindo ? (
              <JobProgress jobId={medirJobId} />
            ) : medirErro ? (
              <ErrorState what={t('erroMedir')} todo={t('erroMedirAcao')} onRetry={() => void medir()} />
            ) : resultado ? (
              <>
                {resultado.pctEstimado === null ? (
                  <>
                    <p className="text-[40px] font-bold leading-none tracking-[-0.02em] text-ink-1">{t('semCarga')}</p>
                    <p className="mt-3 max-w-lg text-xs leading-5 text-ink-3">{t('semCargaAcao', { pico: resultado.cargaPico })}</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-end gap-3">
                      <span className="type-num text-[72px] font-bold leading-none tracking-[-0.02em] text-ink-1">
                        {resultado.pctEstimado}%
                      </span>
                      <span className="mb-3 flex items-center gap-2">
                        <span className="tag">{tk('estimado')}</span>
                        <EstimatedTag />
                      </span>
                    </div>
                    <p className="mt-3 max-w-lg text-xs text-ink-3">{t('disclaimer')}</p>
                  </>
                )}
                {reduzido && (
                  <p className="type-num mt-4 flex flex-wrap items-center gap-2 text-sm font-bold text-ink-1">
                    {linhaReducao(reduzido)} <EstimatedTag />
                  </p>
                )}
                {boostFeito ? (
                  <BoostFeito nota={t('boostAtivoNota')} titulo={t('boostAtivo')} />
                ) : (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="primary" onClick={() => void medir()} disabled={jobAtivo}>
                      {t('medir')}
                    </Button>
                    {resultado.pctProjetado !== null && !reduzido && (
                      <Button
                        onClick={() => {
                          setReduzFase('confirm')
                          setReduzOpen(true)
                        }}
                        disabled={jobAtivo}
                      >
                        {t('reduzir')}
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : boostFeito ? (
              <BoostFeito nota={t('boostAtivoNota')} titulo={t('boostAtivo')} />
            ) : (
              <>
                <p className="mb-5 max-w-lg text-sm text-ink-2">{t('semMedicao')}</p>
                <Button variant="primary" onClick={() => void medir()} disabled={jobAtivo}>
                  {t('medir')}
                </Button>
              </>
            )}
          </div>
        </Surface>

        {/* zona destrutiva: perfil BOOST */}
        <Surface className="overflow-hidden">
          <div className="hazard-bar" aria-hidden />
          <div className="surface-head">
            <span>{t('boost')}</span>
            <span className="ml-auto text-[10px] font-semibold tracking-[0.14em] text-ink-3">{t('boostSubtitulo')}</span>
          </div>
          <div className="p-4">
            <ul className="space-y-1.5">
              {garantias.map((k) => (
                <li key={k} className="flex items-center gap-2 text-[11px] font-bold tracking-[0.04em] text-ink-2">
                  <IconX width={10} height={10} className="shrink-0 text-ink-3" />
                  {t(k)}
                </li>
              ))}
            </ul>
            {boostMedicao && (
              <p className="type-num mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-ink-1">
                {linhaBoost(boostMedicao)} <EstimatedTag />
              </p>
            )}
            {boostFeito ? (
              <div className="mt-4 flex items-center gap-2">
                <IconCheck width={12} height={12} className="shrink-0 text-ink-1" />
                <span className="stamp text-base font-bold text-ink-1">{t('boostAtivo')}</span>
              </div>
            ) : (
              <>
                <HoldButton className="mt-4 w-full" onConfirm={() => void aplicarBoost()} disabled={jobAtivo}>
                  {t('boost')}
                </HoldButton>
                <p className="mt-2 text-center text-[10px] font-semibold tracking-[0.12em] text-ink-4">{tk('segureParaConfirmar')}</p>
              </>
            )}
          </div>
        </Surface>
      </div>

      {/* ===== fluxo CPU ↔ GPU ===== */}
      {invErro && (
        <div className="mt-4">
          <ErrorState what={t('erroInventario')} todo={t('erroInventarioAcao')} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-[1fr_clamp(140px,16vw,240px)_1fr] items-stretch gap-4">
        <ChipCard
          tag={t('cpuTag')}
          nome={inv?.cpu.nome ?? null}
          uso={metrics?.cpuUsage ?? null}
          carregando={!inv && !invErro}
          rows={[
            {
              label: t('clockBase'),
              value: inv ? `${inv.cpu.clockBaseGhz.toFixed(2)} GHz` : null,
            },
            {
              label: metrics?.cpuTempC != null ? t('temp') : t('velocidadeAtual'),
              value:
                metrics?.cpuTempC != null
                  ? `${metrics.cpuTempC} °C`
                  : metrics?.cpuClockGhz != null
                    ? `${metrics.cpuClockGhz.toFixed(2)} GHz`
                    : null,
            },
          ]}
        />
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="type-kicker">{t('fluxo')}</span>
          <FlowBeam cpu={metrics?.cpuUsage ?? null} gpu={metrics?.gpuUsage ?? null} hot={resultado?.pctEstimado != null} />
        </div>
        <ChipCard
          tag={t('gpuTag')}
          nome={inv?.gpu.nome ?? null}
          uso={metrics?.gpuUsage ?? null}
          carregando={!inv && !invErro}
          rows={[
            {
              label: t('temp'),
              value: metrics?.gpuTempC != null ? `${metrics.gpuTempC} °C` : null,
            },
            { label: t('vram'), value: inv ? `${inv.gpu.vramGb} GB` : null },
          ]}
        />
      </div>

      {/* ===== modal REDUZIR ===== */}
      <Modal
        open={reduzOpen}
        title={t('reduzir')}
        onClose={reduzFase === 'run' ? undefined : () => setReduzOpen(false)}
      >
        {reduzFase === 'confirm' && (
          <>
            <p className="mb-3 text-sm text-ink-2">{t('reduzirIntro')}</p>
            <ul className="mb-5 space-y-1.5">
              {(['acaoPlanoEnergia', 'acaoServicos', 'acaoGameMode'] as const).map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-ink-1">
                  <IconChevron width={10} height={10} className="shrink-0 text-signal" />
                  {t(k)}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-3">
              <Button size="sm" onClick={() => setReduzOpen(false)}>
                {tk('cancelar')}
              </Button>
              <Button size="sm" onClick={() => void aplicarReducao()}>
                {tk('confirmar')}
              </Button>
            </div>
          </>
        )}
        {reduzFase === 'run' && <JobProgress jobId={reduzJobId} />}
        {reduzFase === 'done' && reduzido && (
          <>
            <CheckHeadline text={t('acoesAplicadas')} />
            <p className="type-num flex flex-wrap items-center gap-2 text-lg font-bold text-ink-1">
              {linhaReducao(reduzido)} <EstimatedTag />
            </p>
            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={() => setReduzOpen(false)}>
                {tk('fechar')}
              </Button>
            </div>
          </>
        )}
        {reduzFase === 'error' && (
          <>
            <ErrorState
              what={t('erroAplicar')}
              todo={t('erroAplicarAcao')}
              onRetry={() => void aplicarReducao()}
            />
            {applyErro && <p className="type-mono mt-2 text-xs font-bold text-blood">{applyErro}</p>}
          </>
        )}
      </Modal>

      {/* ===== modal BOOST ===== */}
      <Modal
        open={boostOpen}
        title={t('boost')}
        danger={boostFase !== 'done'}
        onClose={boostFase === 'run' ? undefined : () => setBoostOpen(false)}
      >
        <ul className="mb-5 flex flex-wrap gap-x-5 gap-y-1.5">
          {garantias.map((k) => (
            <li key={k} className="flex items-center gap-2 text-[11px] font-bold tracking-[0.04em] text-ink-2">
              <IconX width={10} height={10} className="shrink-0 text-ink-3" />
              {t(k)}
            </li>
          ))}
        </ul>
        {boostFase === 'run' && (
          <div aria-live="polite">
            <p className="text-xs font-bold tracking-[0.1em] text-ink-2">{t(boostEtapa)}</p>
            <ProgressBar pct={boostPct} className="mt-3" showPct={false} />
            <p className="type-num mt-3 text-right text-[11px] text-ink-3">{boostPct}%</p>
          </div>
        )}
        {boostFase === 'done' && boostRes && (
          <>
            <CheckHeadline text={t('boostAplicado')} />
            {boostMedicao && (
              <div className="mb-5 border-y border-line py-3">
                <p className="type-kicker mb-2">{t('boostResultado')}</p>
                <p className="type-num flex flex-wrap items-center gap-2 text-base font-bold text-ink-1">
                  {linhaBoost(boostMedicao)} <EstimatedTag />
                </p>
              </div>
            )}
            {boostMedicaoFalhou && (
              <p className="mb-5 flex items-center gap-2 text-xs font-bold text-signal">
                <IconWarn width={12} height={12} className="shrink-0" />
                {t('boostMedicaoFalhou')}
              </p>
            )}
            <p className="type-kicker mb-2">{t('alteracoes')}</p>
            <ul className="mb-4 space-y-1">
              {boostRes.alteracoesIds.map((id) => {
                const k = ALTERACAO_KEY[id]
                return (
                  <li key={id} className="flex items-center gap-2 text-sm text-ink-1">
                    <IconCheck width={10} height={10} className="shrink-0 text-ink-1" />
                    {k ? t(k) : <span className="type-mono text-xs">{id}</span>}
                  </li>
                )
              })}
            </ul>
            <p className="type-kicker mb-2">{t('recomendacoes')}</p>
            <ul className="mb-5 space-y-1">
              {(['rec1', 'rec2', 'rec3', 'rec4', 'rec5', 'rec6'] as const).map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-ink-2">
                  <IconChevron width={10} height={10} className="shrink-0 text-signal" />
                  {t(k)}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setBoostOpen(false)}>
                {tk('fechar')}
              </Button>
            </div>
          </>
        )}
        {boostFase === 'error' && (
          <>
            <ErrorState
              what={t('erroAplicar')}
              todo={t('erroAplicarAcao')}
              onRetry={() => void aplicarBoost()}
            />
            {applyErro && <p className="type-mono mt-2 text-xs font-bold text-blood">{applyErro}</p>}
          </>
        )}
      </Modal>
    </div>
  )
}
