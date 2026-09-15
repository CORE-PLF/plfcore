import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { ResultModal } from '../../components/Modal'
import { ProgressBar } from '../../components/ProgressBar'
import { DemoTag, KTag } from '../../components/Tag'
import { EmptyState, ErrorState } from '../../components/states'
import { IconCheck } from '../../components/icons'
import { kitDict } from '../../components/i18n'
import { useT } from '../../i18n'
import { getAdapter, isTauriEnv } from '../../services/adapter'
import { getInventoryCached } from '../../services/inventoryCache'
import type { CleanupResult } from '../../services/SystemAdapter'
import { useLogStore } from '../../stores/log'
import { useJobsStore } from '../../stores/jobs'
import { useKillfeedStore } from '../../stores/killfeed'
import { useSettingsStore } from '../../stores/settings'
import type { CleanupCategory, CleanupCategoryId, StorageDevice } from '../../types'
import { cleanupDict } from './i18n'
import './cleanup.css'

const MB = 1024 * 1024
const GB = 1024 * MB

/** Categorias que tocam diretórios de sistema — disparam a oferta de ponto de restauração. */
const SYSTEM_CATS: ReadonlySet<CleanupCategoryId> = new Set([
  'temp-windows',
  'logs-antigos',
  'relatorios-erro',
  'restos-instalacao',
])

function fmtBytes(b: number): string {
  if (b >= GB) return `${(b / GB).toFixed(2)} GB`
  if (b >= MB) return `${Math.round(b / MB)} MB`
  return `${Math.round(b / 1024)} KB`
}

function fmtClock(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Phase = 'idle' | 'scanning' | 'ready' | 'cleaning'

export default function CleanupScreen() {
  const t = useT(cleanupDict)
  const tk = useT(kitDict)

  const [phase, setPhase] = useState<Phase>('idle')
  const [cats, setCats] = useState<CleanupCategory[] | null>(null)
  const [sel, setSel] = useState<Set<CleanupCategoryId>>(new Set())
  const [erro, setErro] = useState<'scan' | 'limpeza' | null>(null)
  const [pct, setPct] = useState<number | null>(null)
  const [etapaCat, setEtapaCat] = useState<CleanupCategoryId | null>(null)
  const [elapsedS, setElapsedS] = useState(0)
  const [scanDurMs, setScanDurMs] = useState<number | null>(null)
  const [resultado, setResultado] = useState<CleanupResult | null>(null)
  const [restoreOverride, setRestoreOverride] = useState<boolean | null>(null)
  const [discos, setDiscos] = useState<StorageDevice[] | null>(null)
  const [limpou, setLimpou] = useState(false)

  const modoDemo = useSettingsStore((s) => s.modoDemo)
  const pontoRestauracaoPadrao = useSettingsStore((s) => s.pontoRestauracaoPadrao)
  // Mesmo critério de adapter.ts: fora do Tauri ou com modo demo, os dados são demo.
  const demo = !isTauriEnv() || modoDemo

  useEffect(() => {
    let on = true
    getInventoryCached()
      .then((inv) => {
        if (on) setDiscos(inv.discos)
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [])

  useEffect(() => {
    if (phase !== 'scanning' && phase !== 'cleaning') return
    setElapsedS(0)
    const t0 = Date.now()
    const h = setInterval(() => setElapsedS(Math.floor((Date.now() - t0) / 1000)), 500)
    return () => clearInterval(h)
  }, [phase])

  const totalBytes = useMemo(() => (cats ?? []).reduce((s, c) => s + c.tamanhoBytes, 0), [cats])
  const totalArquivos = useMemo(() => (cats ?? []).reduce((s, c) => s + c.arquivos, 0), [cats])
  const selBytes = useMemo(
    () => (cats ?? []).filter((c) => sel.has(c.id)).reduce((s, c) => s + c.tamanhoBytes, 0),
    [cats, sel],
  )

  const envolveSistema = useMemo(() => [...sel].some((id) => SYSTEM_CATS.has(id)), [sel])
  const restoreChecked = restoreOverride ?? pontoRestauracaoPadrao

  const scan = async () => {
    setErro(null)
    setResultado(null)
    setLimpou(false)
    setPhase('scanning')
    const jobs = useJobsStore.getState()
    const jobId = jobs.startJob({ moduloId: 'cleanup', tituloKey: 'cleanup.jobVarredura' })
    jobs.advanceState(jobId, 'scanning', 'cleanup.etapaVarredura')
    const t0 = Date.now()
    try {
      const r = await getAdapter().scanCleanup()
      jobs.finishJob(jobId, fmtBytes(r.reduce((s, c) => s + c.tamanhoBytes, 0)))
      setScanDurMs(Date.now() - t0)
      setCats(r)
      // NUNCA pré-selecionar categoria sensível, mesmo que o adapter marque como padrão.
      setSel(new Set(r.filter((c) => c.selecionadaPorPadrao && !c.sensivel).map((c) => c.id)))
      setRestoreOverride(null)
      setPhase('ready')
    } catch {
      jobs.failJob(jobId, 'scan')
      setErro('scan')
      setPhase('idle')
    }
  }

  const clean = async () => {
    if (!cats || sel.size === 0) return
    const ids = [...sel]
    setErro(null)
    setPhase('cleaning')
    setPct(0)
    setEtapaCat(null)
    const jobs = useJobsStore.getState()
    const logStore = useLogStore.getState()
    const feed = useKillfeedStore.getState()
    const jobId = jobs.startJob({ moduloId: 'cleanup', tituloKey: 'cleanup.jobLimpeza' })
    jobs.advanceState(jobId, 'running', 'cleanup.etapaPreparo')
    if (envolveSistema && restoreChecked) {
      logStore.log({
        moduloId: 'cleanup',
        acao: 'ponto-restauracao',
        resultado: 'solicitado',
        reversivel: false,
        detalhes: ids.filter((id) => SYSTEM_CATS.has(id)).join(','),
      })
    }
    // um log por categoria (não por arquivo) — evita estourar o cap do log
    const catLogs = new Map<CleanupCategoryId, string>()
    try {
      const res = await getAdapter().executeCleanup(
        ids,
        (p, etapaId) => {
          const cat = (etapaId as CleanupCategoryId | null) ?? null
          setPct(p)
          setEtapaCat(cat)
          jobs.updateJob(jobId, {
            progressoPct: p,
            etapaKey: cat ? `cleanup.cat.${cat}.nome` : 'cleanup.etapaPreparo',
          })
        },
        (entry) => {
          let logId = catLogs.get(entry.categoriaId)
          if (!logId) {
            logId = logStore.log({
              moduloId: 'cleanup',
              acao: `limpar-${entry.categoriaId}`,
              resultado: 'ok',
              reversivel: false,
              detalhes: entry.categoriaId,
            })
            catLogs.set(entry.categoriaId, logId)
          }
          feed.push({
            alvo: entry.caminho.split('\\').pop() ?? entry.caminho,
            acao: 'removido',
            quantidade: fmtBytes(entry.bytes),
            logId,
          })
        },
      )
      logStore.log({
        moduloId: 'cleanup',
        acao: 'limpeza',
        resultado: `${fmtBytes(res.bytesLiberados)} · ${res.arquivosRemovidos} arquivos`,
        reversivel: false,
        detalhes: ids.join(','),
      })
      jobs.finishJob(jobId, fmtBytes(res.bytesLiberados))
      setCats(cats.filter((c) => !sel.has(c.id)))
      setSel(new Set())
      setLimpou(true)
      setResultado(res)
      setPhase('ready')
    } catch {
      jobs.failJob(jobId, 'limpeza')
      setErro('limpeza')
      setPhase('ready')
    } finally {
      setPct(null)
      setEtapaCat(null)
    }
  }

  const toggle = (id: CleanupCategoryId) =>
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const showList = cats !== null && cats.length > 0
  const cleaning = phase === 'cleaning'
  const busy = phase === 'scanning' || cleaning
  const disco = discos?.[0] ?? null
  const na = tk('naoDisponivel')

  const meta = [
    discos === null ? null : discos.length === 1 ? t('metaDisco1') : t('metaDiscoN', { count: discos.length }),
    cats === null ? null : t('metaCats', { count: cats.length }),
    t('metaNada'),
  ]
    .filter(Boolean)
    .join(' · ')

  const tempo = busy ? fmtClock(elapsedS) : scanDurMs === null ? null : `${(scanDurMs / 1000).toFixed(1)} s`

  const stats: Array<[string, string | null]> = [
    [t('espacoRecuperavel'), cats === null ? null : fmtBytes(totalBytes)],
    [t('arquivosAnalisados'), cats === null ? null : totalArquivos.toLocaleString('pt-BR')],
    [t('discoPrincipal'), disco ? `${disco.usadoGb} / ${disco.capacidadeGb} GB` : null],
    [tk('tempoDecorrido'), tempo],
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-[14px] px-6 pt-[22px] pb-6">
      <ScreenTitle
        kicker={t('kicker')}
        title={t('titulo')}
        meta={meta}
        actions={
          <>
            {demo && <DemoTag />}
            <Button variant={cats === null ? 'primary' : 'secondary'} disabled={busy} onClick={scan}>
              {t('analisar')}
            </Button>
          </>
        }
      />

      <div className="grid flex-none grid-cols-4 gap-3">
        {stats.map(([label, value]) => (
          <Surface key={label} className="clean-stat">
            <span className="type-kicker tracking-[0.14em]">{label}</span>
            <b className={value === null ? 'na' : ''}>{value ?? na}</b>
          </Surface>
        ))}
      </div>

      <Surface className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="surface-head flex-none">
          <span>{t('categorias')}</span>
          {showList && (
            <span className="type-num ml-auto text-[11px] font-semibold tracking-[0.06em] text-ink-3">
              {t('selInfo', { sel: sel.size, total: cats.length })}
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {erro === 'scan' && (
            <div className="p-4">
              <ErrorState what={t('erroScanTitulo')} todo={t('erroScanAcao')} onRetry={scan} />
            </div>
          )}
          {erro === 'limpeza' && (
            <div className="p-4">
              <ErrorState what={t('erroLimpezaTitulo')} todo={t('erroLimpezaAcao')} onRetry={scan} />
            </div>
          )}

          {phase === 'idle' && erro !== 'scan' && <EmptyState code={t('idleCode')} message={t('idleMsg')} />}

          {phase === 'scanning' && (
            <div className="p-4" role="status" aria-live="polite">
              <p className="type-kicker">{t('etapa')}</p>
              <p className="type-mono mt-1 text-xs text-ink-2">{t('etapaVarredura')}</p>
              <div className="mt-3">
                <ProgressBar pct={null} />
              </div>
              <p className="mt-4 text-xs text-ink-3">{t('varrendoNota')}</p>
            </div>
          )}

          {(phase === 'ready' || cleaning) && cats !== null && !showList && (
            <EmptyState code={t('idleCode')} message={t('idleMsg')} />
          )}

          {showList &&
            cats.map((c) => {
              const checked = sel.has(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={cleaning}
                  onClick={() => toggle(c.id)}
                  className="clean-row"
                >
                  <span className={`checkbox ${checked ? 'checkbox--on' : ''}`} aria-hidden>
                    {checked && <IconCheck width={10} height={10} strokeWidth={2.6} />}
                  </span>
                  <span className="w-[230px] flex-none truncate text-xs font-bold tracking-[0.04em] text-ink-1">
                    {t(`cat.${c.id}.nome`)}
                  </span>
                  {c.sensivel && <KTag variant="critical">{t('sensivel')}</KTag>}
                  {cleaning && etapaCat === c.id && <span className="led led--heat" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{t(`cat.${c.id}.desc`)}</span>
                  {c.bytesEmUso > 0 && (
                    <span className="type-num flex-none text-[10px] text-ink-4">
                      {t('emUso', { tamanho: fmtBytes(c.bytesEmUso) })}
                    </span>
                  )}
                  <span className="type-num w-24 flex-none text-right text-[13px] font-bold text-ink-1">
                    {fmtBytes(c.tamanhoBytes)}
                  </span>
                  <span className="type-num w-24 flex-none text-right text-[11px] text-ink-3">
                    {c.arquivos} {t('arquivosSufixo')}
                  </span>
                </button>
              )
            })}
        </div>
      </Surface>

      <Surface className="flex-none overflow-hidden">
        <div className="hazard-bar" aria-hidden />
        <div className="flex items-center gap-5 px-4 py-[14px]">
          <div className="flex flex-none flex-col gap-[3px]">
            <span className="type-kicker tracking-[0.14em]">{t('selecionado')}</span>
            <span className="type-num text-lg font-bold text-ink-1">
              {sel.size > 0 ? `${fmtBytes(selBytes)} · ${sel.size}` : '—'}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            {cleaning ? (
              <div role="status" aria-live="polite">
                <p className="type-mono text-xs text-ink-2">
                  {etapaCat ? t(`cat.${etapaCat}.nome`) : t('etapaPreparo')}
                </p>
                <div className="mt-2">
                  <ProgressBar pct={pct} hot />
                </div>
              </div>
            ) : envolveSistema ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={restoreChecked}
                onClick={() => setRestoreOverride(!restoreChecked)}
                className="flex cursor-pointer items-center gap-[10px] text-left"
              >
                <span className={`checkbox ${restoreChecked ? 'checkbox--on' : ''}`} aria-hidden>
                  {restoreChecked && <IconCheck width={10} height={10} strokeWidth={2.6} />}
                </span>
                <span className="flex flex-col gap-[2px]">
                  <span className="text-xs font-bold tracking-[0.04em] text-ink-1">{t('restauracao')}</span>
                  <span className="text-[11px] text-ink-3">{t('restauracaoDesc')}</span>
                </span>
              </button>
            ) : (
              sel.size === 0 && showList && <p className="text-[11px] text-ink-3">{t('selecioneUma')}</p>
            )}
          </div>

          <HoldButton
            variant="primary"
            className="h-11 w-[240px] flex-none"
            onConfirm={clean}
            disabled={sel.size === 0 || cleaning}
          >
            {limpou && sel.size === 0 ? t('limpezaConcluida') : t('limparSelecionados')}
          </HoldButton>
        </div>
        <div className="flex items-baseline gap-3 px-4 pb-[14px]">
          <span className="type-kicker flex-none font-bold tracking-[0.14em]">{t('zonaProtegida')}</span>
          <span className="text-[11px] text-ink-3">{t('avisoProtegido')}</span>
        </div>
      </Surface>

      <ResultModal
        open={resultado !== null}
        title={t('resultadoTitulo')}
        headline={t('resultadoHeadline')}
        lines={
          resultado
            ? [
                { label: t('espacoLiberado'), value: fmtBytes(resultado.bytesLiberados) },
                { label: t('arquivosRemovidos'), value: String(resultado.arquivosRemovidos) },
                { label: t('duracao'), value: `${(resultado.duracaoMs / 1000).toFixed(1)} s` },
                ...(resultado.origin === 'demo' ? [{ label: t('origem'), value: tk('demo') }] : []),
              ]
            : []
        }
        onClose={() => setResultado(null)}
      />
    </div>
  )
}
