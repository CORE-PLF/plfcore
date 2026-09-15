import { useEffect, useMemo, useState } from 'react'
import { ArmSwitch } from '../components/ArmSwitch'
import { Button } from '../components/Button'
import { HoldButton } from '../components/HoldButton'
import { Modal, ResultModal } from '../components/Modal'
import { ProgressBar } from '../components/ProgressBar'
import { useT } from '../i18n'
import { getAdapter } from '../services/adapter'
import {
  formatRamMb,
  levelOneCandidates,
  processKey,
  processMeta,
  recommendedProcessKeys,
} from '../services/processCandidates'
import { DEBLOAT_BY_ID } from '../services/debloatCatalog'
import type { SystemAdapter } from '../services/SystemAdapter'
import { useLogStore } from '../stores/log'
import { useKillfeedStore } from '../stores/killfeed'
import { useLevelStore } from '../stores/level'
import { useToastsStore } from '../stores/toasts'
import type { ProcessInfo, SystemMetrics } from '../types'
import { kitDict } from '../components/i18n'
import { shellDict } from './i18n'

interface Snapshot {
  cpuPct: number
  ramUsedGb: number
  ramTotalGb: number
}

interface LevelOneResult {
  ramClosedMb: number
  appsClosed: number
  processesClosed: number
  failed: number
  packagesRemoved: number
  packagesFailed: number
  restorePointCreated: boolean | null
}

type RunPhase = 'idle' | 'closing' | 'debloating' | 'applying' | 'settling'
type ShellKey = keyof (typeof shellDict)['pt']

const L1_CHANGES: ShellKey[] = [
  'level.l1.change.power',
  'level.l1.change.cpu',
  'level.l1.change.usb',
  'level.l1.change.pcie',
  'level.l1.change.coreParking',
  'level.l1.change.cpuBoost',
  'level.l1.change.powerThrottling',
  'level.l1.change.gpuScheduling',
  'level.l1.change.netThrottle',
  'level.l1.change.netTcp',
  'level.l1.change.sysmain',
  'level.l1.change.gameMode',
  'level.l1.change.gameDvr',
  'level.l1.change.mmcss',
  'level.l1.change.background',
  'level.l1.change.visuals',
  'level.l1.change.transparency',
  'level.l1.change.services',
  'level.l1.change.tasks',
  'level.l1.change.mouse',
  'level.l1.change.keyboard',
  'level.l1.change.debloat',
]

function averageSnapshot(samples: SystemMetrics[]): Snapshot | null {
  if (!samples.length) return null
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    cpuPct: average(samples.map((sample) => sample.cpuUsage)),
    ramUsedGb: average(samples.map((sample) => sample.ramUsedGb)),
    ramTotalGb: samples.at(-1)?.ramTotalGb ?? 0,
  }
}

function collectSnapshot(adapter: SystemAdapter, sampleCount: number): Promise<Snapshot | null> {
  return new Promise((resolve) => {
    const samples: SystemMetrics[] = []
    let done = false
    let unsubscribe: () => void = () => undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    const finish = () => {
      if (done) return
      done = true
      if (timeout) clearTimeout(timeout)
      unsubscribe()
      resolve(averageSnapshot(samples))
    }

    try {
      unsubscribe = adapter.streamMetrics((sample) => {
        samples.push(sample)
        if (samples.length >= sampleCount) finish()
      }, 400)
      timeout = setTimeout(finish, Math.max(2400, sampleCount * 700))
    } catch {
      finish()
    }
  })
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`
}

function fmtGb(value: number): string {
  return `${value.toFixed(2)} GB`
}

function phaseLabel(t: (key: ShellKey) => string, phase: RunPhase, processName: string): string {
  if (phase === 'closing' && processName) return `${t('level.l1.phase.closing')}: ${processName}`
  return t(`level.l1.phase.${phase}` as keyof (typeof shellDict)['pt'])
}

export function LevelOneFlow({ open, onCancel }: { open: boolean; onCancel: () => void }) {
  const t = useT(shellDict)
  const tk = useT(kitDict)
  const applyLevel = useLevelStore((state) => state.applyLevel)
  const pushToast = useToastsStore((state) => state.push)
  const [armed, setArmed] = useState(false)
  const [processes, setProcesses] = useState<ProcessInfo[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [debloatInstalled, setDebloatInstalled] = useState<string[] | null>(null)
  const [selectedDebloat, setSelectedDebloat] = useState<Set<string>>(new Set())
  const [current, setCurrent] = useState<Snapshot | null>(null)
  const [phase, setPhase] = useState<RunPhase>('idle')
  const [phaseDetail, setPhaseDetail] = useState('')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<LevelOneResult | null>(null)

  const running = phase !== 'idle'
  const candidates = useMemo(() => levelOneCandidates(processes ?? []), [processes])
  const chosen = useMemo(() => candidates.filter((process) => selected.has(processKey(process))), [candidates, selected])
  const selectedRam = chosen.reduce((sum, process) => sum + process.ramMb, 0)
  const debloatCandidates = useMemo(
    () => (debloatInstalled ?? []).map((id) => DEBLOAT_BY_ID.get(id)).filter((item) => item !== undefined),
    [debloatInstalled],
  )
  const chosenDebloat = useMemo(
    () => debloatCandidates.filter((item) => selectedDebloat.has(item.id)),
    [debloatCandidates, selectedDebloat],
  )

  useEffect(() => {
    if (!open) return
    let active = true
    const adapter = getAdapter()
    setArmed(false)
    setPhase('idle')
    setPhaseDetail('')
    setProgress(0)
    setProcesses(null)
    setDebloatInstalled(null)
    setSelectedDebloat(new Set())
    setCurrent(null)

    void Promise.all([adapter.listProcesses(), collectSnapshot(adapter, 3), adapter.scanDebloat()])
      .then(([nextProcesses, snapshot, debloat]) => {
        if (!active) return
        const nextCandidates = levelOneCandidates(nextProcesses)
        setProcesses(nextProcesses)
        setSelected(recommendedProcessKeys(nextCandidates))
        setCurrent(snapshot)
        const installedIds = debloat.filter((item) => item.installed).map((item) => item.id)
        setDebloatInstalled(installedIds)
        setSelectedDebloat(new Set(installedIds.filter((id) => DEBLOAT_BY_ID.get(id)?.recommended)))
      })
      .catch(() => {
        if (!active) return
        setProcesses([])
        setDebloatInstalled([])
      })

    return () => { active = false }
  }, [open])

  const toggle = (key: string) => {
    setSelected((old) => {
      const next = new Set(old)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleDebloat = (id: string) => {
    setSelectedDebloat((old) => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const run = async () => {
    const adapter = getAdapter()
    const targets = [...chosen]
    let ramClosedMb = 0
    let processesClosed = 0
    let appsClosed = 0
    let failed = 0
    let packagesRemoved = 0
    let packagesFailed = 0
    let restorePointCreated: boolean | null = null

    try {
      setPhase('closing')
      setProgress(4)
      const totalPids = Math.max(1, targets.reduce((sum, process) => sum + (process.pids?.length ?? 1), 0))
      let processedPids = 0
      for (const app of targets) {
        let appClosed = 0
        let appRamMb = 0
        setPhaseDetail(app.nome)
        for (const pid of app.pids?.length ? app.pids : [app.pid]) {
          try {
            const closed = await adapter.killProcess(pid)
            ramClosedMb += closed.ramMb
            appRamMb += closed.ramMb
            processesClosed += 1
            appClosed += 1
          } catch {
            failed += 1
          }
          processedPids += 1
          setProgress(8 + (processedPids / totalPids) * 20)
        }
        if (appClosed > 0) {
          appsClosed += 1
          const logId = useLogStore.getState().log({
            moduloId: 'level',
            acao: `preparar-l1-${app.nome}`,
            resultado: formatRamMb(appRamMb),
            reversivel: false,
            detalhes: `${appClosed} processo(s) encerrado(s) antes do L1`,
          })
          useKillfeedStore.getState().push({
            alvo: app.nome,
            acao: 'encerrado',
            quantidade: formatRamMb(appRamMb),
            logId,
          })
        }
      }

      if (chosenDebloat.length > 0) {
        setPhase('debloating')
        setPhaseDetail('')
        const debloat = await adapter.executeDebloat(chosenDebloat.map((item) => item.id), (pct, id) => {
          setPhaseDetail(id === 'restore-point' ? t('level.l1.result.restorePoint') : id ? (DEBLOAT_BY_ID.get(id)?.label ?? id) : '')
          setProgress(30 + pct * 0.2)
        })
        packagesRemoved = debloat.removed
        packagesFailed = debloat.failed
        restorePointCreated = debloat.restorePointCreated
        for (const item of debloat.items.filter((entry) => entry.status === 'removed')) {
          const label = DEBLOAT_BY_ID.get(item.id)?.label ?? item.id
          const logId = useLogStore.getState().log({
            moduloId: 'windows',
            acao: `debloat-${item.id}`,
            resultado: 'REMOVIDO',
            reversivel: false,
            detalhes: `${label} removido do usuário atual e do provisionamento, quando disponível`,
          })
          useKillfeedStore.getState().push({ alvo: label, acao: 'removido', quantidade: 'APP WINDOWS', logId })
        }
      }

      setPhaseDetail('')
      setPhase('applying')
      await applyLevel(1, (pct, stage) => {
        setPhaseDetail(stage ?? '')
        setProgress((chosenDebloat.length > 0 ? 51 : 30) + pct * (chosenDebloat.length > 0 ? 0.43 : 0.62))
      })

      setPhase('settling')
      setPhaseDetail('')
      setProgress(96)
      await new Promise<void>((resolve) => setTimeout(resolve, 3500))
      setProgress(100)
      setResult({
        ramClosedMb,
        appsClosed,
        processesClosed,
        failed,
        packagesRemoved,
        packagesFailed,
        restorePointCreated,
      })
      pushToast({ tipo: 'sucesso', mensagem: `${t('level.aplicado')} — L1 ${t('level.nome.1')}` })
    } catch {
      pushToast({ tipo: 'erro', mensagem: t('level.erro') })
    } finally {
      setPhase('idle')
      setPhaseDetail('')
      setProgress(0)
      setArmed(false)
    }
  }

  const close = () => {
    if (running) return
    setArmed(false)
    onCancel()
  }

  const resultLines = result ? [
    { label: t('level.l1.result.freed'), value: formatRamMb(result.ramClosedMb) },
    { label: t('level.l1.result.apps'), value: String(result.appsClosed) },
    { label: t('level.l1.result.processes'), value: String(result.processesClosed) },
    { label: t('level.l1.result.packages'), value: String(result.packagesRemoved) },
    ...(result.restorePointCreated !== null ? [{
      label: t('level.l1.result.restorePoint'),
      value: result.restorePointCreated ? t('level.l1.result.created') : t('level.l1.result.unavailable'),
    }] : []),
    ...(result.packagesFailed ? [{ label: t('level.l1.result.packagesFailed'), value: String(result.packagesFailed) }] : []),
    ...(result.failed ? [{ label: t('level.l1.result.failed'), value: String(result.failed) }] : []),
  ] : []

  return (
    <>
      <Modal open={open || running} danger title={`L1 — ${t('level.nome.1')}`} onClose={close} width={760}>
        {running ? (
          <div className="l1-running">
            <p className="type-kicker text-heat">{t('level.l1.executing')}</p>
            <h3 className="type-display mt-2 text-xl">{phaseLabel(t, phase, phaseDetail)}</h3>
            {(phase === 'applying' || phase === 'debloating') && phaseDetail && (
              <p className="type-mono mt-2 text-xs text-ink-3">{phaseDetail}</p>
            )}
            <ProgressBar pct={progress} hot className="mt-5" />
            <p className="type-mono mt-3 text-[11px] leading-5 text-ink-3">{t('level.l1.doNotClose')}</p>
          </div>
        ) : (
          <>
            <div className="l1-preflight-head">
              <div>
                <p className="type-kicker text-heat">{t('level.l1.preflight')}</p>
                <p className="type-mono mt-2 max-w-xl text-xs leading-5 text-ink-2">{t('level.l1.warning')}</p>
              </div>
              <div className="l1-live-readout">
                <span><small>{t('level.l1.currentCpu')}</small><strong>{current ? fmtPct(current.cpuPct) : '—'}</strong></span>
                <span><small>{t('level.l1.currentRam')}</small><strong>{current ? fmtGb(current.ramUsedGb) : '—'}</strong></span>
              </div>
            </div>

            <p className="type-kicker mt-4 mb-2">{t('level.l1.included')}</p>
            <div className="l1-change-grid">
              {L1_CHANGES.map((key) => (
                <span key={key}><i aria-hidden>✓</i>{t(key)}</span>
              ))}
            </div>

            <div className="l1-process-summary">
              <span>{t('level.l1.closeSelected')}</span>
              <strong>{chosen.length} {t('level.l1.apps')} · {formatRamMb(selectedRam)}</strong>
            </div>

            <div className="l1-process-list">
              {processes === null && <p className="type-mono p-5 text-center text-xs text-ink-3">{t('level.l1.scanning')}</p>}
              {processes !== null && candidates.length === 0 && (
                <p className="type-mono p-5 text-center text-xs text-ink-3">{t('level.l1.noCandidates')}</p>
              )}
              {candidates.map((process) => {
                const key = processKey(process)
                const meta = processMeta(process.nome)
                const checked = selected.has(key)
                return (
                  <label key={key} className={`l1-process-row l1-process-row--${meta.kind} ${checked ? 'is-selected' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(key)} />
                    <span className="l1-process-check">{checked ? '✓' : ''}</span>
                    <span className="l1-process-name">
                      <strong>{process.nome}</strong>
                      <small>{meta.kind === 'recommended' ? t('level.l1.safeClose') : t('level.l1.saveWork')}</small>
                    </span>
                    <span className={`l1-process-tag l1-process-tag--${meta.kind}`}>
                      {meta.kind === 'recommended' ? t('level.l1.recommended') : t('level.l1.attention')}
                    </span>
                    <strong className="l1-process-ram">{formatRamMb(process.ramMb)}</strong>
                  </label>
                )
              })}
            </div>

            <div className="l1-process-summary l1-debloat-summary">
              <span>{t('level.l1.debloatTitle')}</span>
              <strong>{chosenDebloat.length} / {debloatCandidates.length} {t('level.l1.packages')}</strong>
            </div>

            <div className="l1-process-list l1-debloat-list">
              {debloatInstalled === null && <p className="type-mono p-5 text-center text-xs text-ink-3">{t('level.l1.debloatScanning')}</p>}
              {debloatInstalled !== null && debloatCandidates.length === 0 && (
                <p className="type-mono p-5 text-center text-xs text-ink-3">{t('level.l1.debloatNone')}</p>
              )}
              {debloatCandidates.map((item) => {
                const checked = selectedDebloat.has(item.id)
                return (
                  <label key={item.id} className={`l1-process-row ${checked ? 'is-selected' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleDebloat(item.id)} />
                    <span className="l1-process-check">{checked ? '✓' : ''}</span>
                    <span className="l1-process-name">
                      <strong>{item.label}</strong>
                      <small>{item.recommended ? t('level.l1.debloatRecommendedDesc') : t('level.l1.debloatOptionalDesc')}</small>
                    </span>
                    <span className={`l1-process-tag l1-process-tag--${item.recommended ? 'recommended' : 'attention'}`}>
                      {item.recommended ? t('level.l1.recommended') : t('level.l1.optional')}
                    </span>
                    <strong className="l1-process-ram">{t('level.l1.installed')}</strong>
                  </label>
                )
              })}
            </div>

            <p className="type-mono mt-3 text-[11px] leading-5 text-heat">{t('level.l1.debloatWarning')}</p>
            <div className="l1-actions">
              <Button size="sm" onClick={close}>{tk('cancelar')}</Button>
              <div className="flex items-center gap-3">
                <ArmSwitch armed={armed} onChange={setArmed} />
                <HoldButton armed={armed} onConfirm={() => void run()} disabled={processes === null || debloatInstalled === null}>
                  {t('level.l1.prepareApply')}
                </HoldButton>
              </div>
            </div>
          </>
        )}
      </Modal>

      <ResultModal
        open={result !== null}
        title={t('level.l1.result.title')}
        headline={t('level.l1.result.headline')}
        lines={resultLines}
        onClose={() => setResult(null)}
      />
    </>
  )
}
