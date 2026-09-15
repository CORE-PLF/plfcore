import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { ChamferSurface } from '../../components/ChamferSurface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { MetricRow } from '../../components/MetricRow'
import { ResultModal } from '../../components/Modal'
import { Odometer } from '../../components/Odometer'
import { SegmentedProgress } from '../../components/SegmentedProgress'
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
import { DiskIllustration } from './DiskIllustration'
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
  const hero = totalBytes >= GB
    ? { v: totalBytes / GB, d: 2, u: 'GB' }
    : { v: totalBytes / MB, d: 0, u: 'MB' }

  const envolveSistema = useMemo(() => [...sel].some((id) => SYSTEM_CATS.has(id)), [sel])
  const restoreChecked = restoreOverride ?? pontoRestauracaoPadrao

  const scan = async () => {
    setErro(null)
    setResultado(null)
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

  return (
    <div className="p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} />

      <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(300px,2fr)_3fr]">
        <DiskIllustration scanning={phase === 'scanning'} />

        <ChamferSurface cut={8} className="self-start">
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="type-display text-xl">{t('statusDisco')}</h2>
              <div className="flex items-center gap-3">
                {discos && <KTag variant="ok">{t('discosDetectados', { count: discos.length })}</KTag>}
                {demo && <DemoTag />}
                {phase === 'ready' && showList && (
                  <Button size="sm" onClick={scan}>
                    {t('analisar')}
                  </Button>
                )}
              </div>
            </div>

            <div className="mb-5 space-y-3">
              {discos === null && <MetricRow label={t('unidade')} value={null} />}
              {discos?.map((disco, index) => (
                <div key={`${disco.modelo}-${index}`} className="border-b border-line pb-2 last:border-b-0">
                  <MetricRow
                    label={disco.particoes.length > 0 ? disco.particoes.join(' + ') : `${t('unidade')} ${index + 1}`}
                    value={disco.modelo}
                  />
                  <MetricRow label={t('uso')} value={`${disco.usadoGb} / ${disco.capacidadeGb} GB`} />
                </div>
              ))}
            </div>

            {erro === 'scan' && (
              <ErrorState what={t('erroScanTitulo')} todo={t('erroScanAcao')} onRetry={scan} />
            )}
            {erro === 'limpeza' && (
              <div className="mb-4">
                <ErrorState what={t('erroLimpezaTitulo')} todo={t('erroLimpezaAcao')} onRetry={scan} />
              </div>
            )}

            {phase === 'idle' && erro !== 'scan' && (
              <EmptyState
                code={t('idleCode')}
                message={t('idleMsg')}
                action={
                  <Button variant="primary" onClick={scan}>
                    {t('analisar')}
                  </Button>
                }
              />
            )}

            {phase === 'scanning' && (
              <div role="status" aria-live="polite">
                <p className="type-kicker">{t('etapa')}</p>
                <p className="type-mono mt-1 text-xs text-ink-2">{t('etapaVarredura')}</p>
                <div className="mt-3">
                  <SegmentedProgress pct={null} />
                </div>
                <p className="type-mono mt-2 text-[11px] text-ink-3">
                  {tk('tempoDecorrido')} {fmtClock(elapsedS)}
                </p>
                <p className="mt-4 text-xs text-ink-3">{t('varrendoNota')}</p>
              </div>
            )}

            {(phase === 'ready' || cleaning) && cats !== null && (
              <>
                {showList ? (
                  <>
                    <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-6">
                      <div>
                        <p className="type-kicker">{t('espacoRecuperavel')}</p>
                        <Odometer
                          value={hero.v}
                          decimals={hero.d}
                          suffix={` ${hero.u}`}
                          className="text-4xl font-bold text-ink-1"
                        />
                      </div>
                      <div className="text-right">
                        <p className="type-kicker">{t('arquivosAnalisados')}</p>
                        <Odometer value={totalArquivos} className="text-lg font-bold text-ink-1" />
                      </div>
                      <div className="text-right">
                        <p className="type-kicker">{tk('tempoDecorrido')}</p>
                        <span className="type-mono text-lg font-bold text-ink-1">
                          {scanDurMs === null ? tk('naoDisponivel') : `${(scanDurMs / 1000).toFixed(1)} s`}
                        </span>
                      </div>
                    </div>

                    <div role="group" aria-label={t('categorias')} className="border-t border-line">
                      {cats.map((c) => {
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
                            <span className="clean-check" aria-hidden>
                              {checked && <IconCheck width={10} height={10} strokeWidth={2.5} className="text-ink-1" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="text-[13px] font-bold uppercase tracking-wide text-ink-1">
                                  {t(`cat.${c.id}.nome`)}
                                </span>
                                {c.sensivel && <KTag>{t('sensivel')}</KTag>}
                                {cleaning && etapaCat === c.id && <span className="led led--heat" aria-hidden />}
                              </span>
                              <span className="block truncate text-xs text-ink-3">{t(`cat.${c.id}.desc`)}</span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="type-mono block text-sm font-bold text-ink-1">
                                {fmtBytes(c.tamanhoBytes)}
                              </span>
                              <span className="type-mono block text-[10px] text-ink-3">
                                {c.arquivos} {t('arquivosSufixo')}
                              </span>
                              {c.bytesEmUso > 0 && (
                                <span className="type-mono block text-[10px] text-ink-4">
                                  {t('emUso', { tamanho: fmtBytes(c.bytesEmUso) })}
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {cleaning ? (
                      <div className="mt-5" role="status" aria-live="polite">
                        <p className="type-kicker">{t('etapa')}</p>
                        <p className="type-mono mt-1 text-xs text-ink-2">
                          {etapaCat ? t(`cat.${etapaCat}.nome`) : t('etapaPreparo')}
                        </p>
                        <div className="mt-3">
                          <SegmentedProgress pct={pct} hot />
                        </div>
                        <p className="type-mono mt-2 text-[11px] text-ink-3">
                          {tk('tempoDecorrido')} {fmtClock(elapsedS)}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-5">
                        <div className="hazard h-1.5" aria-hidden />
                        <div className="border border-t-0 border-line p-4">
                          {envolveSistema && (
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={restoreChecked}
                              onClick={() => setRestoreOverride(!restoreChecked)}
                              className="clean-row clean-row--solo mb-2"
                            >
                              <span className="clean-check" aria-hidden>
                                {restoreChecked && (
                                  <IconCheck width={10} height={10} strokeWidth={2.5} className="text-ink-1" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-bold uppercase tracking-wide text-ink-1">
                                  {t('restauracao')}
                                </span>
                                <span className="block text-xs text-ink-3">{t('restauracaoDesc')}</span>
                              </span>
                            </button>
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <p className="type-kicker">{t('selecionado')}</p>
                              <p className="type-mono text-sm font-bold text-ink-1">
                                {sel.size > 0 ? `${fmtBytes(selBytes)} · ${sel.size}` : '—'}
                              </p>
                            </div>
                            <HoldButton onConfirm={clean} disabled={sel.size === 0}>
                              {t('limparSelecionados')}
                            </HoldButton>
                          </div>
                          {sel.size === 0 && <p className="mt-2 text-xs text-ink-3">{t('selecioneUma')}</p>}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <EmptyState
                    code={t('idleCode')}
                    message={t('idleMsg')}
                    action={
                      <Button variant="primary" onClick={scan}>
                        {t('analisar')}
                      </Button>
                    }
                  />
                )}
              </>
            )}

            <div className="mt-5 flex items-baseline gap-3 border-t border-line pt-3">
              <span className="type-kicker shrink-0">{t('zonaProtegida')}</span>
              <span className="text-xs text-ink-3">{t('avisoProtegido')}</span>
            </div>
          </div>
        </ChamferSurface>
      </div>

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
