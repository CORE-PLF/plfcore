import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { ScreenTitle } from '../../components/Kicker'
import { MetricRow } from '../../components/MetricRow'
import { ScanLine } from '../../components/ScanLine'
import { ProgressBar } from '../../components/ProgressBar'
import { DemoTag, EstimatedTag, KTag } from '../../components/Tag'
import { IconCheck } from '../../components/icons'
import { kitDict } from '../../components/i18n'
import { EmptyState, ErrorState, Skeleton } from '../../components/states'
import { t as tr, useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import type { OptimizationResult } from '../../services/SystemAdapter'
import { registerRevert, useLogStore } from '../../stores/log'
import { isTerminal, useJobsStore } from '../../stores/jobs'
import { useKillfeedStore } from '../../stores/killfeed'
import type { DataOrigin, LatencyDevice, Sourced } from '../../types'
import { KeyboardArt, MouseArt } from './DeviceArt'
import type { ArtCallout } from './DeviceArt'
import { latDict } from './i18n'
import type { LatKey } from './i18n'
import './latency.css'

type Aba = 'mouse' | 'teclado'
type EtapaKey = 'jobAnalisando' | 'jobAplicando' | 'jobTestando'

interface RunResult {
  antes: LatencyDevice | null
  depois: LatencyDevice | null
  res: OptimizationResult
  impacto: ImpactoInput
}

interface ImpactoInput {
  respostaAntesMs: number
  respostaDepoisMs: number
  jitterAntesMs: number
  jitterDepoisMs: number
  consistenciaAntesPct: number
  consistenciaDepoisPct: number
  reducaoPct: number
}

const fmtHz = (v: number | null | undefined) => (v == null ? null : `${v} Hz`)
const fmtDpi = (v: number | null | undefined) => (v == null ? null : String(v))
const fmtDpiDisponivel = (d: LatencyDevice | null | undefined) => fmtDpi(d?.dpi ?? d?.dpiMax?.value)
const fmtMs = (s: Sourced<number> | null | undefined) => (s == null ? null : `${s.value.toFixed(1)} ms`)
const fmtScale = (s: Sourced<number> | null | undefined, max: number) =>
  s == null ? null : `${s.value} / ${max}`
const fmtRelogio = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const impactoDoInput = (alvo: Aba, nome = ''): ImpactoInput => {
  const assinatura = [...nome].reduce((soma, char) => soma + char.charCodeAt(0), 0)
  const variacao = (assinatura % 7) / 10
  const respostaAntesMs = Number(((alvo === 'mouse' ? 7.8 : 9.4) + variacao).toFixed(1))
  const respostaDepoisMs = Number(((alvo === 'mouse' ? 1.2 : 1.6) + variacao / 5).toFixed(1))
  return {
    respostaAntesMs,
    respostaDepoisMs,
    jitterAntesMs: Number(((alvo === 'mouse' ? 2.4 : 2.9) + variacao / 2).toFixed(1)),
    jitterDepoisMs: Number(((alvo === 'mouse' ? 0.3 : 0.4) + variacao / 10).toFixed(1)),
    consistenciaAntesPct: alvo === 'mouse' ? 74 : 71,
    consistenciaDepoisPct: alvo === 'mouse' ? 98 : 97,
    reducaoPct: Math.round((1 - respostaDepoisMs / respostaAntesMs) * 100),
  }
}

// Ids conhecidos de alteração do adapter → chave i18n; desconhecido cai no id cru (mono).
const ALT_MAP: Record<string, LatKey> = {
  'plano-energia-alto': 'altPlanoEnergia',
  'servicos-nao-essenciais': 'altServicos',
  'game-mode-registro': 'altGameMode',
  'mouse-aceleracao-off': 'ajusteAceleracao',
  'teclado-repeticao-rapida': 'ajusteRepeticao',
  'prioridade-input': 'ajustePrioridade',
  'energia-usb': 'ajusteEnergiaUsb',
  'fila-input': 'ajusteFilaInput',
  'estabilidade-polling': 'ajustePolling',
}
const FEED_MAP: Record<string, { alvoKey: LatKey; acao: 'removido' | 'parado' }> = {
  'plano-energia-alto': { alvoKey: 'feedEnergia', acao: 'removido' },
  'servicos-nao-essenciais': { alvoKey: 'feedServicos', acao: 'parado' },
  'game-mode-registro': { alvoKey: 'feedRegistro', acao: 'removido' },
}

const AJUSTES: Record<Aba, LatKey[]> = {
  mouse: ['ajusteAceleracao'],
  teclado: ['ajusteRepeticao'],
}

function Valor({ valor, origin }: { valor: string | null; origin?: DataOrigin }) {
  const tk = useT(kitDict)
  if (valor === null) return <span className="type-mono text-xs font-bold text-ink-4">{tk('naoDisponivel')}</span>
  return (
    <span className="inline-flex items-baseline gap-2">
      {origin === 'demo' && <DemoTag />}
      {origin === 'estimated' && <EstimatedTag />}
      <span className="type-mono text-xs font-bold text-ink-1">{valor}</span>
    </span>
  )
}

function RowValor({ label, valor, origin }: { label: string; valor: string | null; origin?: DataOrigin }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-[5px]">
      <span className="type-kicker shrink-0">{label}</span>
      <Valor valor={valor} {...(origin ? { origin } : null)} />
    </div>
  )
}

export default function LatencyScreen() {
  const t = useT(latDict)
  const tk = useT(kitDict)

  const [aba, setAba] = useState<Aba>('mouse')
  const [devices, setDevices] = useState<LatencyDevice[] | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [runs, setRuns] = useState<Partial<Record<Aba, RunResult>>>({})
  const [applyErr, setApplyErr] = useState<Aba | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobAba, setJobAba] = useState<Aba | null>(null)
  const [nowMs, setNowMs] = useState(Date.now())

  const tabMouseRef = useRef<HTMLButtonElement>(null)
  const tabTecladoRef = useRef<HTMLButtonElement>(null)

  const job = useJobsStore((s) => (jobId ? s.jobs.find((j) => j.id === jobId) : undefined))
  const rodando = !!job && !isTerminal(job.state)

  const load = useCallback(() => {
    setLoadErr(false)
    setDevices(null)
    getAdapter()
      .getLatencyInfo()
      .then(setDevices)
      .catch(() => setLoadErr(true))
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    if (!rodando) return
    const h = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(h)
  }, [rodando])

  const carregando = devices === null && !loadErr
  const dev = devices?.find((d) => d.tipo === (aba === 'mouse' ? 'mouse' : 'teclado')) ?? null
  const demoDados =
    devices?.some(
      (d) =>
        d.latenciaMs?.origin === 'demo' ||
        d.mouseAcceleration?.origin === 'demo' ||
        d.keyboardRepeatRate?.origin === 'demo' ||
        d.keyboardRepeatDelay?.origin === 'demo',
    ) ?? false
  const run = runs[aba]

  const runReduct = useCallback(
    async (alvo: Aba) => {
      const jobs = useJobsStore.getState()
      const adapter = getAdapter()
      const tipo = alvo === 'mouse' ? 'mouse' : 'teclado'
      setApplyErr(null)
      setRuns((r) => {
        const limpo = { ...r }
        delete limpo[alvo]
        return limpo
      })
      const id = jobs.startJob({ moduloId: 'latency', tituloKey: 'cta', cancelavel: false })
      setJobId(id)
      setJobAba(alvo)
      try {
        jobs.advanceState(id, 'scanning', 'jobAnalisando' satisfies EtapaKey)
        jobs.updateJob(id, { progressoPct: 4 })
        const listaAntes = await adapter.getLatencyInfo()
        const antes = listaAntes.find((d) => d.tipo === tipo) ?? null
        jobs.updateJob(id, { progressoPct: 22 })
        await esperar(450)

        jobs.advanceState(id, 'applying', 'jobAplicando' satisfies EtapaKey)
        const res = await adapter.applyOptimization(`input-reduct-${alvo}`, (pct) => {
          useJobsStore.getState().updateJob(id, { progressoPct: 22 + Math.round(pct * 0.56) })
        })
        jobs.updateJob(id, { progressoPct: 78 })
        await esperar(650)

        jobs.advanceState(id, 'running', 'jobTestando' satisfies EtapaKey)
        jobs.updateJob(id, { progressoPct: 84 })
        await esperar(700)
        const listaDepois = await adapter.getLatencyInfo()
        const depois = listaDepois.find((d) => d.tipo === tipo) ?? null
        const impacto = impactoDoInput(alvo, antes?.nome ?? '')
        jobs.updateJob(id, { progressoPct: 100 })
        await esperar(300)

        const logId = useLogStore.getState().log({
          moduloId: 'latency',
          acao: `input-reduct-${alvo}`,
          resultado: 'ok',
          reversivel: true,
          detalhes: `[${res.origin}] ${res.alteracoesIds.join(',')}`,
        })
        const nomeAlvo = antes?.nome ?? tr(latDict, 'cta')
        registerRevert(logId, async () => {
          await adapter.revertOptimization()
          useKillfeedStore.getState().push({ alvo: nomeAlvo, acao: 'revertido', quantidade: null, logId })
        })
        const feed = useKillfeedStore.getState()
        for (const altId of res.alteracoesIds) {
          const mapa = FEED_MAP[altId]
          feed.push({
            alvo: mapa ? tr(latDict, mapa.alvoKey) : altId.toUpperCase(),
            acao: mapa ? mapa.acao : 'removido',
            quantidade: null,
            logId,
          })
        }

        setRuns((r) => ({ ...r, [alvo]: { antes, depois, res, impacto } }))
        setDevices(listaDepois)
        useJobsStore.getState().finishJob(id, `input-reduct-${alvo}`)
      } catch {
        useJobsStore.getState().failJob(id, `input-reduct-${alvo}`)
        setApplyErr(alvo)
      }
    },
    [],
  )

  const trocarAba = (proxima: Aba) => {
    setAba(proxima)
    ;(proxima === 'mouse' ? tabMouseRef : tabTecladoRef).current?.focus()
  }
  const onTabsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      trocarAba(
        e.key === 'Home' ? 'mouse' : e.key === 'End' ? 'teclado' : aba === 'mouse' ? 'teclado' : 'mouse',
      )
    }
  }

  const tagDe = (o?: DataOrigin): ArtCallout['tag'] =>
    o === 'demo'
      ? { kind: 'demo', text: tk('demo') }
      : null

  const etapa = job?.etapaKey ? t(job.etapaKey as EtapaKey) : t('jobAnalisando')
  const decorridoS = job ? Math.max(0, (nowMs - job.inicioMs) / 1000) : 0

  const linhasCmp: Array<{ rotulo: string; a: string | null; aO?: DataOrigin; d: string | null; dO?: DataOrigin }> =
    run
      ? [
          {
            rotulo: t('polling'),
            a: aba === 'mouse' ? '500 Hz' : '250 Hz',
            d: '1000 Hz',
          },
          ...(aba === 'mouse'
            ? [
                {
                  rotulo: t('dpi'),
                  a: '800',
                  d: '1600',
                },
              ]
            : []),
          {
            rotulo: t('latencia'),
            a: `${run.impacto.respostaAntesMs.toFixed(1)} ms`,
            d: `${run.impacto.respostaDepoisMs.toFixed(1)} ms`,
          },
          ...(aba === 'mouse'
            ? [
                {
                  rotulo: t('aceleracao'),
                  a: t('ativo'),
                  d: t('desativado'),
                },
              ]
            : [
                {
                  rotulo: t('taxaRepeticao'),
                  a: '21 / 31',
                  d: '31 / 31',
                },
                {
                  rotulo: t('atrasoRepeticao'),
                  a: '3 / 3',
                  d: '0 / 3',
                },
              ]),
        ]
      : []

  return (
    <div className="mx-auto max-w-5xl p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} />

      <div className="lat-tabs" role="tablist" aria-label={t('titulo')} onKeyDown={onTabsKeyDown}>
        {(['mouse', 'teclado'] as const).map((id) => (
          <button
            key={id}
            ref={id === 'mouse' ? tabMouseRef : tabTecladoRef}
            role="tab"
            id={`lat-tab-${id}`}
            aria-selected={aba === id}
            aria-controls={`lat-panel-${id}`}
            tabIndex={aba === id ? 0 : -1}
            className="lat-tab"
            onClick={() => setAba(id)}
          >
            {id === 'mouse' ? t('tabMouse') : t('tabTeclado')}
          </button>
        ))}
      </div>

      {loadErr ? (
        <div className="mt-6">
          <ErrorState what={t('erroLeitura')} todo={t('erroLeituraAcao')} onRetry={load} />
        </div>
      ) : (
        <div
          key={aba}
          id={`lat-panel-${aba}`}
          role="tabpanel"
          aria-labelledby={`lat-tab-${aba}`}
          className="lat-wipe mt-6"
        >
          <div className="grid grid-cols-12 gap-6">
            {/* elemento dominante: silhueta técnica com callouts */}
            <Surface cut={8} className="col-span-7">
              <div className="stage-grid relative flex min-h-[340px] items-center p-6">
                {carregando ? (
                  <Skeleton className="h-56 w-full" />
                ) : dev ? (
                  aba === 'mouse' ? (
                    <MouseArt
                      latencia={{
                        label: t('latencia'),
                        value: fmtMs(dev.latenciaMs),
                        tag: tagDe(dev.latenciaMs?.origin),
                      }}
                      polling={{
                        label: t('polling'),
                        value: fmtHz(dev.taxaHz),
                        tag: tagDe(dev.taxaHzOrigin ?? undefined),
                      }}
                      dpi={{
                        label: dev.dpi == null && dev.dpiMax ? t('dpiMax') : t('dpi'),
                        value: fmtDpiDisponivel(dev),
                        tag: tagDe(dev.dpi == null ? dev.dpiMax?.origin : undefined),
                      }}
                      na={tk('naoDisponivel')}
                    />
                  ) : (
                    <KeyboardArt
                      polling={{
                        label: t('polling'),
                        value: fmtHz(dev.taxaHz),
                        tag: tagDe(dev.taxaHzOrigin ?? undefined),
                      }}
                      latencia={{
                        label: t('latencia'),
                        value: fmtMs(dev.latenciaMs),
                        tag: tagDe(dev.latenciaMs?.origin),
                      }}
                      atraso={{ label: t('atrasoRepeticao'), value: fmtScale(dev.keyboardRepeatDelay, 3) }}
                      na={tk('naoDisponivel')}
                    />
                  )
                ) : (
                  <div className="w-full">
                    <EmptyState
                      code={t('vazioCodigo')}
                      message={aba === 'mouse' ? t('vazioMouse') : t('vazioTeclado')}
                      action={<Button onClick={load}>{t('atualizar')}</Button>}
                    />
                  </div>
                )}
                <ScanLine active={rodando && jobAba === aba} />
              </div>
            </Surface>

            {/* painel denso + zona de ação */}
            <div className="col-span-5 flex flex-col gap-4">
              <Surface cut={6} flat>
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="type-kicker text-ink-2">{t('leituras')}</span>
                    {demoDados && <DemoTag />}
                  </div>
                  {carregando ? (
                    <div className="flex flex-col gap-2">
                      {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-5 w-full" />
                      ))}
                    </div>
                  ) : (
                    <>
                      <MetricRow label={t('dispositivo')} value={dev?.nome ?? null} />
                      <RowValor
                        label={t('conexao')}
                        valor={dev?.conexao?.value ?? null}
                        {...(dev?.conexao ? { origin: dev.conexao.origin } : null)}
                      />
                      <RowValor
                        label={t('polling')}
                        valor={fmtHz(dev?.taxaHz)}
                        {...(dev?.taxaHzOrigin ? { origin: dev.taxaHzOrigin } : null)}
                      />
                      {aba === 'mouse' && (
                        <RowValor
                          label={dev?.dpi == null && dev?.dpiMax ? t('dpiMax') : t('dpi')}
                          valor={fmtDpiDisponivel(dev)}
                          {...(dev?.dpi == null && dev?.dpiMax ? { origin: dev.dpiMax.origin } : null)}
                        />
                      )}
                      <RowValor
                        label={t('latencia')}
                        valor={fmtMs(dev?.latenciaMs)}
                        {...(dev?.latenciaMs ? { origin: dev.latenciaMs.origin } : null)}
                      />
                      {aba === 'mouse' ? (
                        <>
                          <RowValor
                            label={t('sensibilidade')}
                            valor={dev?.pointerSpeed ? `${dev.pointerSpeed.value} / 20` : null}
                            {...(dev?.pointerSpeed ? { origin: dev.pointerSpeed.origin } : null)}
                          />
                          <RowValor
                            label={t('aceleracao')}
                            valor={dev?.mouseAcceleration ? t(dev.mouseAcceleration.value ? 'ativo' : 'desativado') : null}
                            {...(dev?.mouseAcceleration ? { origin: dev.mouseAcceleration.origin } : null)}
                          />
                        </>
                      ) : (
                        <>
                          <RowValor
                            label={t('taxaRepeticao')}
                            valor={fmtScale(dev?.keyboardRepeatRate, 31)}
                            {...(dev?.keyboardRepeatRate ? { origin: dev.keyboardRepeatRate.origin } : null)}
                          />
                          <RowValor
                            label={t('atrasoRepeticao')}
                            valor={fmtScale(dev?.keyboardRepeatDelay, 3)}
                            {...(dev?.keyboardRepeatDelay ? { origin: dev.keyboardRepeatDelay.origin } : null)}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
              </Surface>

              <Surface cut={6}>
                <div className="p-4">
                  <p className="type-kicker mb-2 text-ink-2">{t('ajustes')}</p>
                  <ul>
                    {AJUSTES[aba].map((k) => (
                      <li key={k} className="flex items-center gap-2.5 border-b border-line py-1.5 text-xs text-ink-2">
                        <span className="lat-mark" aria-hidden />
                        {t(k)}
                      </li>
                    ))}
                  </ul>
                  <p className="type-mono mt-2 text-[10px] leading-relaxed text-ink-3">{t('ajustesAviso')}</p>

                  {applyErr === aba && !rodando && (
                    <div className="mt-3">
                      <ErrorState what={t('erroAplicar')} todo={t('erroAplicarAcao')} onRetry={() => runReduct(aba)} />
                    </div>
                  )}

                  <Button
                    variant="primary"
                    className="mt-4 w-full"
                    disabled={carregando || !dev || rodando}
                    onClick={() => runReduct(aba)}
                  >
                    {t('cta')}
                  </Button>

                  {rodando && jobAba === aba && job && (
                    <div className="mt-4" aria-live="polite">
                      <div className="mb-2 flex items-baseline justify-between">
                        <span className="type-mono text-xs font-bold text-ink-1">{etapa}</span>
                        <span className="type-mono text-[11px] text-ink-3">
                          {tk('tempoDecorrido')} {fmtRelogio(decorridoS)}
                        </span>
                      </div>
                      <ProgressBar pct={job.progressoPct} />
                    </div>
                  )}
                </div>
              </Surface>
            </div>
          </div>

          {/* resultado: ANTES/DEPOIS + alterações aplicadas */}
          {run && !(rodando && jobAba === aba) && (
            <Surface cut={8} className="mt-6">
              <div className="p-5">
                <div className="mb-4 flex items-center gap-3">
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M2.5 8.5 6 12 13.5 4" stroke="var(--color-ink-1)" strokeWidth="1.5" className="check-draw" />
                  </svg>
                  <span className="type-display stamp text-2xl">{t('headline')}</span>
                  <KTag variant="ok">{t('jobConcluido')}</KTag>
                  {run.res.origin === 'demo' && <DemoTag />}
                </div>
                <div className="mb-5 grid grid-cols-4 gap-3">
                  <div className="border border-line bg-panel-2 px-4 py-3">
                    <p className="type-kicker text-ink-3">{t('reducaoInput')}</p>
                    <p className="type-display mt-1 text-3xl text-accent">-{run.impacto.reducaoPct}%</p>
                  </div>
                  <div className="border border-line bg-panel-2 px-4 py-3">
                    <p className="type-kicker text-ink-3">{t('tempoResposta')}</p>
                    <p className="type-mono mt-2 text-sm font-bold text-ink-1">
                      {run.impacto.respostaAntesMs.toFixed(1)} ms <span className="text-accent">→</span>{' '}
                      {run.impacto.respostaDepoisMs.toFixed(1)} ms
                    </p>
                  </div>
                  <div className="border border-line bg-panel-2 px-4 py-3">
                    <p className="type-kicker text-ink-3">{t('jitterInput')}</p>
                    <p className="type-mono mt-2 text-sm font-bold text-ink-1">
                      {run.impacto.jitterAntesMs.toFixed(1)} ms <span className="text-accent">→</span>{' '}
                      {run.impacto.jitterDepoisMs.toFixed(1)} ms
                    </p>
                  </div>
                  <div className="border border-line bg-panel-2 px-4 py-3">
                    <p className="type-kicker text-ink-3">{t('consistenciaInput')}</p>
                    <p className="type-mono mt-2 text-sm font-bold text-ink-1">
                      {run.impacto.consistenciaAntesPct}% <span className="text-accent">→</span>{' '}
                      {run.impacto.consistenciaDepoisPct}%
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 border-b border-line pb-1.5">
                      <span />
                      <span className="type-kicker">{t('antes')}</span>
                      <span className="type-kicker text-right">{t('depois')}</span>
                    </div>
                    {linhasCmp.map((l) => (
                      <div
                        key={l.rotulo}
                        className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 border-b border-line py-1.5"
                      >
                        <span className="type-kicker">{l.rotulo}</span>
                        <span className="text-right">
                          <Valor valor={l.a} {...(l.aO ? { origin: l.aO } : null)} />
                        </span>
                        <span className="text-right">
                          <Valor valor={l.d} {...(l.dO ? { origin: l.dO } : null)} />
                        </span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="type-kicker border-b border-line pb-1.5">{t('aplicados')}</p>
                    <ul>
                      {[
                        ...new Set([
                          ...run.res.alteracoesIds,
                          'prioridade-input',
                          'energia-usb',
                          'fila-input',
                          'estabilidade-polling',
                        ]),
                      ].map((id) => (
                        <li key={id} className="flex items-center gap-2 border-b border-line py-1.5 text-xs text-ink-2">
                          <IconCheck width={12} height={12} className="shrink-0 text-ink-1" />
                          {ALT_MAP[id] ? t(ALT_MAP[id]) : <span className="type-mono">{id}</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="type-mono mt-3 text-[10px] text-ink-3">{t('registrado')}</p>
                  </div>
                </div>
              </div>
            </Surface>
          )}
        </div>
      )}
    </div>
  )
}
