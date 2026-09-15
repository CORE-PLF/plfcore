import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { Modal, ResultModal } from '../../components/Modal'
import { ProgressBar } from '../../components/ProgressBar'
import { KTag } from '../../components/Tag'
import { IconCheck } from '../../components/icons'
import { Skeleton } from '../../components/states'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useLogStore } from '../../stores/log'
import { useKillfeedStore } from '../../stores/killfeed'
import { useToastsStore } from '../../stores/toasts'
import type { ProcessInfo } from '../../types'
import { memDict } from './i18n'
import './memory.css'

type ProcessKind = 'recommended' | 'attention' | 'optional'

interface ProcessMeta {
  kind: ProcessKind
  reasonKey: 'procReasonBackground' | 'procReasonAttention' | 'procReasonOptional'
}

interface LiberationResult {
  ramMb: number
  apps: number
  processes: number
  failed: number
}

const RECOMMENDED = [
  'discord',
  'spotify',
  'teams',
  'slack',
  'whatsapp',
  'onedrive',
  'dropbox',
  'ccxprocess',
  'creative cloud',
  'adobeupdater',
  'phoneexperiencehost',
  'widgets',
  'gamebar',
  'epicgameslauncher',
  'battle.net',
  'steamwebhelper',
  'riotclientservices',
  'chrome_updater',
]

const ATTENTION = [
  'chrome',
  'msedge',
  'firefox',
  'opera',
  'brave',
  'code.exe',
  'devenv',
  'winword',
  'excel',
  'powerpnt',
  'notepad',
  'docker',
  'obs',
  'photoshop',
  'illustrator',
  'afterfx',
  'premiere',
  'heidisql',
]

const KIND_TAG: Record<ProcessKind, 'demo' | 'critical' | 'estimated'> = {
  recommended: 'demo',
  attention: 'critical',
  optional: 'estimated',
}

function processMeta(nome: string): ProcessMeta {
  const n = nome.toLowerCase()
  if (RECOMMENDED.some((x) => n.includes(x))) return { kind: 'recommended', reasonKey: 'procReasonBackground' }
  if (ATTENTION.some((x) => n.includes(x))) return { kind: 'attention', reasonKey: 'procReasonAttention' }
  return { kind: 'optional', reasonKey: 'procReasonOptional' }
}

function procKey(p: ProcessInfo): string {
  return p.nome.toLowerCase()
}

function fmtRam(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

export function ProcessLiberator() {
  const t = useT(memDict)
  const [processes, setProcesses] = useState<ProcessInfo[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' })
  const [result, setResult] = useState<LiberationResult | null>(null)
  const autoSelected = useRef(false)

  const load = useCallback(async () => {
    try {
      const next = await getAdapter().listProcesses()
      setProcesses(next)
      if (!autoSelected.current) {
        autoSelected.current = true
        setSelected(new Set(next.filter((p) => processMeta(p.nome).kind === 'recommended').map(procKey)))
      } else {
        const valid = new Set(next.map(procKey))
        setSelected((old) => new Set([...old].filter((key) => valid.has(key))))
      }
    } catch {
      setProcesses([])
      useToastsStore.getState().push({ tipo: 'erro', mensagem: t('procLoadError') })
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (processes ?? []).filter((p) => !q || p.nome.toLowerCase().includes(q))
  }, [processes, query])

  const chosen = useMemo(() => (processes ?? []).filter((p) => selected.has(procKey(p))), [processes, selected])
  const selectedRam = chosen.reduce((sum, p) => sum + p.ramMb, 0)
  const selectedInstances = chosen.reduce((sum, p) => sum + (p.instances ?? p.pids?.length ?? 1), 0)
  const recommendedCount = (processes ?? []).filter((p) => processMeta(p.nome).kind === 'recommended').length
  const hasAttention = chosen.some((p) => processMeta(p.nome).kind === 'attention')

  const toggle = (key: string) => {
    setSelected((old) => {
      const next = new Set(old)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectRecommended = () => {
    setSelected(new Set((processes ?? []).filter((p) => processMeta(p.nome).kind === 'recommended').map(procKey)))
  }

  const liberate = async () => {
    const targets = [...chosen]
    setConfirmOpen(false)
    setRunning(true)
    setProgress({ current: 0, total: selectedInstances, name: targets[0]?.nome ?? '' })
    let ramMb = 0
    let apps = 0
    let closed = 0
    let failed = 0

    for (const app of targets) {
      let appRam = 0
      let appClosed = 0
      const pids = app.pids?.length ? app.pids : [app.pid]
      for (const pid of pids) {
        setProgress({ current: closed + failed, total: selectedInstances, name: app.nome })
        try {
          const killed = await getAdapter().killProcess(pid)
          appRam += killed.ramMb
          ramMb += killed.ramMb
          closed += 1
          appClosed += 1
        } catch {
          failed += 1
        }
      }
      if (appClosed > 0) {
        apps += 1
        const logId = useLogStore.getState().log({
          moduloId: 'memory',
          acao: `liberar-${app.nome}`,
          resultado: fmtRam(appRam),
          reversivel: false,
          detalhes: `${appClosed} processo(s) encerrado(s)`,
        })
        useKillfeedStore.getState().push({ alvo: app.nome, acao: 'encerrado', quantidade: fmtRam(appRam), logId })
      }
    }

    setProgress({ current: closed + failed, total: selectedInstances, name: '' })
    setRunning(false)
    setResult({ ramMb, apps, processes: closed, failed })
    setSelected(new Set())
    await load()
  }

  return (
    <Surface className="mt-4 overflow-hidden">
      <div className="surface-head">
        {t('procTitle')}
        {processes !== null && <span className="pill pill--value">{t('procLidos', { n: processes.length })}</span>}
        <span className="type-kicker ml-auto">{t('procRecoverable')}</span>
        <span className="type-num text-[14px] font-bold text-signal">{fmtRam(selectedRam)}</span>
        <span className="pill pill--value">{t('procSelected', { apps: chosen.length, processes: selectedInstances })}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <p className="mr-auto max-w-[52ch] text-[12px] leading-snug text-ink-3">{t('procDescription')}</p>
        <label className="process-search">
          <span aria-hidden>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('procSearch')} />
        </label>
        <Button size="sm" onClick={selectRecommended} disabled={!recommendedCount || running}>
          {t('procRecommended')} · {recommendedCount}
        </Button>
        <Button size="sm" onClick={() => setSelected(new Set(visible.map(procKey)))} disabled={!visible.length || running}>
          {t('procAll')} · {visible.length}
        </Button>
        <Button size="sm" onClick={() => setSelected(new Set())} disabled={!selected.size || running}>
          {t('procClear')}
        </Button>
        <Button size="sm" onClick={() => void load()} disabled={running}>
          {t('procRefresh')}
        </Button>
      </div>

      <div className="process-list" aria-label={t('procTitle')}>
        {processes === null && (
          <div className="flex flex-col gap-1 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {processes?.length === 0 && <p className="type-kicker p-6 text-center">{t('procEmpty')}</p>}
        {visible.map((p) => {
          const key = procKey(p)
          const meta = processMeta(p.nome)
          const checked = selected.has(key)
          const instances = p.instances ?? p.pids?.length ?? 1
          return (
            <label key={key} className={`process-row ${checked ? 'is-selected' : ''}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(key)} disabled={running} />
              <span className={`checkbox ${checked ? 'checkbox--on' : ''}`} aria-hidden>
                {checked && <IconCheck width={11} height={11} strokeWidth={2.2} />}
              </span>
              <span className="min-w-0">
                <span className="process-nome">{p.nome}</span>
                <span className="process-motivo">
                  {t(meta.reasonKey)} · {t('procInstances', { count: instances })}
                </span>
              </span>
              <KTag variant={KIND_TAG[meta.kind]}>{t(`procKind.${meta.kind}`)}</KTag>
              <span className="process-ram">{fmtRam(p.ramMb)}</span>
            </label>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-5 px-4 py-3">
        <p className="max-w-[80ch] text-[10px] font-semibold leading-4 tracking-[0.06em] text-ink-3">{t('procSafety')}</p>
        <Button variant="primary" disabled={!chosen.length || running} onClick={() => setConfirmOpen(true)}>
          {t('procRelease')} · {fmtRam(selectedRam)}
        </Button>
      </div>

      <Modal open={confirmOpen} title={t('procConfirmTitle')} onClose={() => setConfirmOpen(false)} danger={hasAttention}>
        <p className="text-xs leading-5 text-ink-2">{hasAttention ? t('procConfirmAttention') : t('procConfirmSafe')}</p>
        <dl className="my-4">
          <div className="flex justify-between border-b border-line py-2">
            <dt className="type-kicker">{t('procApplications')}</dt>
            <dd className="type-num text-xs font-bold text-ink-1">{chosen.length}</dd>
          </div>
          <div className="flex justify-between border-b border-line py-2">
            <dt className="type-kicker">{t('procEstimate')}</dt>
            <dd className="type-num text-xs font-bold text-signal">{fmtRam(selectedRam)}</dd>
          </div>
        </dl>
        <div className="flex justify-end gap-3">
          <Button size="sm" onClick={() => setConfirmOpen(false)}>
            {t('procCancel')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => void liberate()}>
            {t('procConfirm')}
          </Button>
        </div>
      </Modal>

      <Modal open={running} title={t('procRunningTitle')}>
        <p className="mb-3 text-xs text-ink-2">{progress.name}</p>
        <ProgressBar pct={progress.total ? (progress.current / progress.total) * 100 : 0} showPct={false} />
        <p className="type-num mt-2 text-right text-xs text-ink-3">
          {progress.current} / {progress.total}
        </p>
      </Modal>

      <ResultModal
        open={result !== null}
        title={t('procResultTitle')}
        headline={t('procResultHeadline')}
        lines={
          result
            ? [
                { label: t('procFreed'), value: fmtRam(result.ramMb) },
                { label: t('procClosedApps'), value: String(result.apps) },
                { label: t('procClosedProcesses'), value: String(result.processes) },
                ...(result.failed ? [{ label: t('procFailed'), value: String(result.failed) }] : []),
              ]
            : []
        }
        onClose={() => setResult(null)}
      />
    </Surface>
  )
}
