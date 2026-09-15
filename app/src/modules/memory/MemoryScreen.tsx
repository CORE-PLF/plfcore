import { useEffect, useState } from 'react'
import { ScreenTitle } from '../../components/Kicker'
import { Surface } from '../../components/Surface'
import { Button } from '../../components/Button'
import { MetricRow } from '../../components/MetricRow'
import { ProgressBar } from '../../components/ProgressBar'
import { ProgressModal, ResultModal } from '../../components/Modal'
import { DemoTag, EstimatedTag } from '../../components/Tag'
import { ErrorState, Skeleton } from '../../components/states'
import { useJobsStore, isTerminal } from '../../stores/jobs'
import { useLogStore } from '../../stores/log'
import { useKillfeedStore } from '../../stores/killfeed'
import { useToastsStore } from '../../stores/toasts'
import { getAdapter } from '../../services/adapter'
import { getInventoryCached, invalidateInventory } from '../../services/inventoryCache'
import { useT } from '../../i18n'
import type { CleanupCategoryId, HardwareInventory, SystemMetrics } from '../../types'
import type { CleanupResult } from '../../services/SystemAdapter'
import { RamStick } from './RamStick'
import { ProcessLiberator } from './ProcessLiberator'
import { memDict } from './i18n'
import type { MemKey } from './i18n'
import './memory.css'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// "Cache de sistema" = categorias de cache/temporários não sensíveis do adapter.
const CACHE_IDS: ReadonlyArray<CleanupCategoryId> = ['temp-usuario', 'temp-windows', 'cache-apps', 'miniaturas']

function fmtBytes(b: number): string {
  const mb = b / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

function fmtMmSs(s: number): string {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/** Série de 60s de RAM em uso — linha ancorada à direita, escala 0..total. */
function UsageChart({ samples, ariaLabel }: { samples: SystemMetrics[]; ariaLabel: string }) {
  const W = 240
  const H = 56
  if (samples.length < 2) return <div className="stage-grid h-14 w-full" aria-hidden />
  const max = Math.max(...samples.map((s) => s.ramTotalGb), 1)
  const step = W / 59
  const pts = samples.map((s, i) => {
    const x = W - (samples.length - 1 - i) * step
    const y = H - (s.ramUsedGb / max) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const first = pts[0]!.split(',')[0]
  return (
    <div className="stage-grid w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-14 w-full" preserveAspectRatio="none" role="img" aria-label={ariaLabel}>
        <polygon points={`${first},${H} ${pts.join(' ')} ${W},${H}`} fill="rgba(255,77,46,0.12)" />
        <polyline points={pts.join(' ')} fill="none" stroke="var(--color-heat)" strokeWidth="1.5" />
      </svg>
    </div>
  )
}

/** Sobrevive à troca de tela e morre quando o app fecha: pente otimizado só
 *  volta a aceitar OTIMIZAR depois de fechar e abrir o PLF CORE. */
const sessao: { otimizados: Set<string> } = { otimizados: new Set() }

export default function MemoryScreen() {
  const t = useT(memDict)
  const [inv, setInv] = useState<HardwareInventory | null>(null)
  const [invErr, setInvErr] = useState(false)
  const [retry, setRetry] = useState(0)
  const [samples, setSamples] = useState<SystemMetrics[]>([])
  const [stickJobs, setStickJobs] = useState<Record<string, string>>({})
  const [otimizados, setOtimizados] = useState<Set<string>>(() => new Set(sessao.otimizados))
  const [cacheJobId, setCacheJobId] = useState<string | null>(null)
  const [cacheResult, setCacheResult] = useState<CleanupResult | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const jobs = useJobsStore((s) => s.jobs)

  useEffect(() => {
    let vivo = true
    setInvErr(false)
    getInventoryCached()
      .then((i) => vivo && setInv(i))
      .catch(() => vivo && setInvErr(true))
    return () => {
      vivo = false
    }
  }, [retry])

  useEffect(() => getAdapter().streamMetrics((m) => setSamples((s) => [...s.slice(-59), m]), 1000), [])

  const temJobAtivo = jobs.some((j) => j.moduloId === 'memory' && !isTerminal(j.state))
  useEffect(() => {
    if (!temJobAtivo) return
    const h = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(h)
  }, [temJobAtivo])

  const mem = inv?.memoria ?? null
  const demo = inv?.origin === 'demo'
  const last = samples.length > 0 ? samples[samples.length - 1]! : null
  const cargaPct = last ? Math.round((last.ramUsedGb / last.ramTotalGb) * 100) : null
  const estimado = last?.origin === 'estimated'

  const otimizarPente = async (slot: string) => {
    const store = useJobsStore.getState()
    const id = store.startJob({ moduloId: 'memory', tituloKey: 'otimizar', cancelavel: true })
    setStickJobs((m) => ({ ...m, [slot]: id }))
    store.advanceState(id, 'scanning', 'analisando')
    // otimização simulada por tempo — sem API nativa; resultado leva selo DEMO
    for (let pct = 0; pct <= 100; pct += 4) {
      await sleep(110 + Math.random() * 70)
      const atual = useJobsStore.getState().jobs.find((j) => j.id === id)
      if (!atual || isTerminal(atual.state)) return
      if (pct === 40) useJobsStore.getState().advanceState(id, 'running', 'otimizando')
      useJobsStore.getState().updateJob(id, { progressoPct: pct })
    }
    useLogStore.getState().log({
      moduloId: 'memory',
      acao: 'otimizar-pente',
      resultado: demo ? 'simulado-demo' : 'ok',
      reversivel: false,
      detalhes: slot,
    })
    useJobsStore.getState().finishJob(id, slot)
    sessao.otimizados.add(slot)
    setOtimizados(new Set(sessao.otimizados))
  }

  const limparCache = async () => {
    const store = useJobsStore.getState()
    const id = store.startJob({ moduloId: 'memory', tituloKey: 'cacheJobTitle', cancelavel: false })
    setCacheJobId(id)
    store.advanceState(id, 'scanning', 'cacheStep1')
    try {
      const adapter = getAdapter()
      const cats = await adapter.scanCleanup()
      useJobsStore.getState().advanceState(id, 'scanning', 'cacheStep2')
      useJobsStore.getState().updateJob(id, { progressoPct: 8 })
      const alvo = cats.filter((c) => CACHE_IDS.includes(c.id) && !c.sensivel).map((c) => c.id)
      useJobsStore.getState().advanceState(id, 'running', 'cacheStep3')
      const res = await adapter.executeCleanup(alvo, (pct) => {
        useJobsStore.getState().updateJob(id, { progressoPct: 8 + Math.round(pct * 0.88) })
      })
      useJobsStore.getState().advanceState(id, 'applying', 'cacheStep4')
      useJobsStore.getState().updateJob(id, { progressoPct: 100 })
      await sleep(350)
      const logId = useLogStore.getState().log({
        moduloId: 'memory',
        acao: 'limpar-cache-sistema',
        resultado: fmtBytes(res.bytesLiberados),
        reversivel: false,
        detalhes: alvo.join(','),
      })
      useKillfeedStore.getState().push({
        alvo: t('cacheFeedTarget'),
        acao: 'removido',
        quantidade: fmtBytes(res.bytesLiberados),
        logId,
      })
      useJobsStore.getState().finishJob(id, fmtBytes(res.bytesLiberados))
      setCacheResult(res)
    } catch {
      useJobsStore.getState().failJob(id, 'cache')
      useToastsStore.getState().push({ tipo: 'erro', mensagem: t('cacheError') })
    }
  }

  const cacheJob = jobs.find((j) => j.id === cacheJobId)
  const cacheAtivo = !!cacheJob && !isTerminal(cacheJob.state)

  const fabricantes = mem
    ? [...new Set(mem.sticks.filter((s) => s.ocupado && s.fabricante).map((s) => s.fabricante as string))].join(' / ') || null
    : null
  const partNumbers = mem
    ? [...new Set(mem.sticks.filter((s) => s.ocupado && s.partNumber).map((s) => s.partNumber as string))].join(' / ') || null
    : null
  const ocupados = mem ? mem.sticks.filter((s) => s.ocupado).length : 0

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex items-start justify-between gap-6">
        <ScreenTitle kicker={t('kicker')} title={t('title')} />
        <div className="flex shrink-0 items-center gap-3 pt-1">
          {demo && <DemoTag full />}
          <Button variant="primary" onClick={limparCache} disabled={cacheAtivo}>
            {t('cacheAction')}
          </Button>
        </div>
      </div>

      {invErr ? (
        <ErrorState
          what={t('errWhat')}
          todo={t('errTodo')}
          onRetry={() => {
            invalidateInventory()
            setInv(null)
            setRetry((r) => r + 1)
          }}
        />
      ) : (
        <div className="grid grid-cols-[1.7fr_1fr] items-start gap-6">
          <section className="flex flex-col gap-4" aria-label={t('title')}>
            {mem
              ? mem.sticks.map((stick) => {
                  const job = jobs.find((j) => j.id === stickJobs[stick.slot])
                  return (
                    <RamStick
                      key={stick.slot}
                      stick={stick}
                      tecnologia={mem.tecnologia}
                      usagePct={cargaPct}
                      job={job}
                      demo={demo}
                      elapsedS={job ? Math.max(0, (now - job.inicioMs) / 1000) : 0}
                      otimizado={otimizados.has(stick.slot)}
                      onOptimize={() => void otimizarPente(stick.slot)}
                      onCancel={() => job && useJobsStore.getState().cancelJob(job.id)}
                    />
                  )
                })
              : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px] w-full" />)}
          </section>

          <Surface cut={8} flat className="p-4">
            <p className="type-kicker mb-2">{t('panelKicker')}</p>
            {mem ? (
              <>
                <MetricRow label={t('mCapacidade')} value={`${mem.totalGb} GB`} />
                <MetricRow label={t('mModulos')} value={`${ocupados}/${mem.sticks.length}`} />
                <MetricRow label={t('mVelocidade')} value={`${mem.velocidadeMhz} MHz`} />
                <MetricRow label={t('mTecnologia')} value={mem.tecnologia} />
                <MetricRow
                  label={t('mCanal')}
                  value={mem.canal === 'dual' ? t('canalDual') : mem.canal === 'single' ? t('canalSingle') : null}
                />
                <MetricRow label={t('mEmUso')} value={last ? `${last.ramUsedGb.toFixed(1)} GB` : null} />
                <MetricRow label={t('mDisponivel')} value={last ? `${(last.ramTotalGb - last.ramUsedGb).toFixed(1)} GB` : null} />
                <MetricRow label={t('mFabricante')} value={fabricantes} />
                <MetricRow label={t('mPartNumbers')} value={partNumbers} />
              </>
            ) : (
              Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="mb-2 h-5 w-full" />)
            )}

            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <span className="type-kicker">{t('carga')}</span>
                <span className="type-mono text-xs font-bold text-ink-1">
                  {cargaPct !== null ? `${cargaPct}%` : '—'}
                  {estimado && (
                    <>
                      {' '}
                      <EstimatedTag />
                    </>
                  )}
                </span>
              </div>
              <ProgressBar pct={cargaPct} showPct={false} hot={(cargaPct ?? 0) > 85} className="mt-1.5" />
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <span className="type-kicker">{t('usoLive')}</span>
                <span className="type-mono text-[10px] text-ink-4">{t('janela')}</span>
              </div>
              <div className="mt-1.5">
                <UsageChart samples={samples} ariaLabel={t('chartAria')} />
              </div>
              {last && (
                <p className="type-mono mt-1 text-right text-xs font-bold text-ink-1">
                  {last.ramUsedGb.toFixed(1)} / {last.ramTotalGb} GB
                </p>
              )}
            </div>
          </Surface>
        </div>
      )}

      <ProcessLiberator />

      <ProgressModal
        open={cacheAtivo}
        title={t('cacheJobTitle')}
        step={cacheJob?.etapaKey ? t(cacheJob.etapaKey as MemKey) : ''}
        pct={cacheJob?.progressoPct ?? null}
        elapsedS={cacheJob ? Math.max(0, (now - cacheJob.inicioMs) / 1000) : 0}
        cancellable={false}
      />

      <ResultModal
        open={cacheResult !== null}
        title={t('cacheJobTitle')}
        headline={t('cacheDone')}
        lines={
          cacheResult
            ? [
                { label: t('cacheFreed'), value: fmtBytes(cacheResult.bytesLiberados) },
                { label: t('cacheFiles'), value: String(cacheResult.arquivosRemovidos) },
                { label: t('cacheDuration'), value: fmtMmSs(cacheResult.duracaoMs / 1000) },
                ...(cacheResult.origin === 'demo' ? [{ label: t('cacheOrigin'), value: 'DEMO' }] : []),
              ]
            : []
        }
        onClose={() => setCacheResult(null)}
      />
    </div>
  )
}
