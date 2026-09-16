import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { Gauge } from '../../components/Gauge'
import { ScreenTitle } from '../../components/Kicker'
import { Skeleton } from '../../components/states'
import { DemoTag } from '../../components/Tag'
import { IconBolt } from '../../components/icons'
import { kitDict } from '../../components/i18n'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { getInventoryCached } from '../../services/inventoryCache'
import { useLogStore } from '../../stores/log'
import { useKillfeedStore } from '../../stores/killfeed'
import { useNav } from '../../stores/nav'
import { useLevelStore } from '../../stores/level'
import { shellDict } from '../../shell/i18n'
import { useToastsStore } from '../../stores/toasts'
import type { HardwareInventory, ProcessInfo, SystemMetrics } from '../../types'
import { cockpitDict } from './i18n'

const PONTOS = 60

// Plot 600x120 com padding 10/4; série alinhada à direita (agora = borda direita).
function polyPoints(serie: SystemMetrics[], get: (m: SystemMetrics) => number): string {
  return serie
    .map((m, i) => {
      const x = 10 + ((PONTOS - serie.length + i) * 580) / (PONTOS - 1)
      const y = 4 + (100 - Math.max(0, Math.min(100, get(m)))) * 1.12
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function fmtUptime(hours: number): string {
  const total = Math.max(0, Math.floor(hours))
  const days = Math.floor(total / 24)
  const remainingHours = total % 24
  return days > 0 ? `${days} d ${remainingHours} h` : `${remainingHours} h`
}

function DataRow({ label, value }: { label: string; value: string | null }) {
  const tk = useT(kitDict)
  return (
    <div className="datarow">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 max-[1400px]:text-[10px] max-[1400px]:tracking-[0.02em]">
        {label}
      </span>
      <span className={`type-num truncate text-xs font-bold ${value === null ? 'text-ink-4' : 'text-ink-1'}`}>
        {value ?? tk('naoDisponivel')}
      </span>
    </div>
  )
}

function Reading({ label, value, last = false }: { label: string; value: string | null; last?: boolean }) {
  const tk = useT(kitDict)
  return (
    <div className={`flex min-h-8 flex-1 items-center justify-between gap-3 px-4 ${last ? '' : 'border-b border-line'}`}>
      <span className="min-w-0 truncate text-[11px] font-semibold tracking-[0.1em] text-ink-3">{label}</span>
      <span className={`type-num truncate text-xs font-bold ${value === null ? 'text-ink-4' : 'text-ink-1'}`} title={value ?? undefined}>
        {value ?? tk('naoDisponivel')}
      </span>
    </div>
  )
}

function Instrument({
  name,
  code,
  value,
  peak,
  sublabel,
  onClick,
  rows,
  usoAgora,
  naoDisponivel,
}: {
  name: string
  code: string
  value: number | null
  peak: number | null
  sublabel: string | null
  onClick: () => void
  rows: Array<{ label: string; value: string | null }>
  usoAgora: string
  naoDisponivel: string
}) {
  return (
    <Surface className="overflow-hidden">
      <div className="surface-head justify-between" style={{ minHeight: 40, padding: '0 14px' }}>
        <span>{name}</span>
        <span className="type-num text-[10px] font-normal tracking-[0.18em] text-ink-3">{code}</span>
      </div>
      <div className="flex gap-3 p-[14px]">
        <div className="w-[42%] min-w-[104px] max-w-[186px] shrink-0">
          <Gauge value={value} peak={peak} label={name} sublabel={sublabel} onClick={onClick} showLabel={false} fluid />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
          <div className="min-w-0">
            <span className="block text-[11px] font-semibold tracking-[0.14em] text-ink-3">{usoAgora}</span>
            {value === null ? (
              <span className="block text-[20px] font-bold leading-[1.05] text-ink-4">{naoDisponivel}</span>
            ) : (
              <span className="type-num block text-[clamp(28px,2.6vw,40px)] font-bold leading-[1.05] text-ink-1">{Math.round(value)}%</span>
            )}
            <span className="type-num block truncate text-[11px] text-ink-3" title={sublabel ?? undefined}>
              {sublabel ?? naoDisponivel}
            </span>
          </div>
          <div className="mt-auto overflow-hidden rounded-[6px]">
            {rows.map((r) => (
              <DataRow key={r.label} label={r.label} value={r.value} />
            ))}
          </div>
        </div>
      </div>
    </Surface>
  )
}

export default function CockpitScreen() {
  const t = useT(cockpitDict)
  const tk = useT(kitDict)
  const go = useNav((s) => s.go)
  const tShell = useT(shellDict)
  const nivel = useLevelStore((s) => s.atual)
  const registros = useLogStore((s) => s.logs.length)
  const pushFeed = useKillfeedStore((s) => s.push)
  const pushToast = useToastsStore((s) => s.push)

  const [serie, setSerie] = useState<SystemMetrics[]>([])
  const [inv, setInv] = useState<HardwareInventory | null>(null)
  const [procs, setProcs] = useState<ProcessInfo[] | null>(null)

  useEffect(() => getAdapter().streamMetrics((m) => setSerie((s) => [...s, m].slice(-PONTOS)), 1000), [])

  const loadProcs = useCallback(() => {
    getAdapter()
      .listProcesses()
      .then((p) => setProcs(p.slice(0, 5)))
      .catch(() => setProcs([]))
  }, [])

  useEffect(loadProcs, [loadProcs])

  const encerrar = useCallback(
    (p: ProcessInfo) => {
      getAdapter()
        .killProcess(p.pid)
        .then((morto) => {
          const logId = useLogStore.getState().log({
            moduloId: 'cockpit',
            acao: `encerrar-${morto.nome}`,
            resultado: `${morto.ramMb} MB`,
            reversivel: false,
            detalhes: morto.origin,
          })
          pushFeed({ alvo: morto.nome, acao: 'encerrado', quantidade: `${morto.ramMb} MB`, logId })
          loadProcs()
        })
        .catch(() => pushToast({ tipo: 'erro', mensagem: t('erroKill', { nome: p.nome }) }))
    },
    [loadProcs, pushFeed, pushToast, t],
  )

  useEffect(() => {
    let vivo = true
    getInventoryCached().then((i) => {
      if (vivo) setInv(i)
    })
    return () => {
      vivo = false
    }
  }, [])

  const atual = serie[serie.length - 1]
  const cpuClockAtual = atual?.cpuClockGhz ?? inv?.cpu.clockAtualGhz ?? null
  const ramPct = atual && atual.ramTotalGb > 0 ? (atual.ramUsedGb / atual.ramTotalGb) * 100 : 0
  const picoCpu = serie.length ? Math.max(...serie.map((m) => m.cpuUsage)) : null
  const gpuSamples = serie.filter((m) => m.gpuUsage !== null)
  const picoGpu = gpuSamples.length ? Math.max(...gpuSamples.map((m) => m.gpuUsage ?? 0)) : null
  const picoRam = serie.length && atual && atual.ramTotalGb > 0
    ? (Math.max(...serie.map((m) => m.ramUsedGb)) / atual.ramTotalGb) * 100
    : null
  const discoPrincipal = inv?.discos[0]
  const naoDisponivel = tk('naoDisponivel')

  const picos = [
    picoCpu !== null ? t('picoCpu', { v: `${Math.round(picoCpu)}%` }) : null,
    picoGpu !== null ? t('picoGpu', { v: `${Math.round(picoGpu)}%` }) : null,
  ].filter(Boolean)

  const leituras: Array<{ label: string; value: string | null }> = [
    {
      label: t('uptime'),
      value: inv
        ? `${fmtUptime(inv.os.uptimeHoras)} · ${t(
            inv.os.uptimeHoras >= 72 ? 'uptimeReiniciar' : inv.os.uptimeHoras >= 24 ? 'uptimeContinuo' : 'uptimeRecente',
          )}`
        : null,
    },
    { label: t('plano'), value: inv?.energia.planoAtivo ?? null },
    {
      label: t('rede'),
      value: inv
        ? inv.rede.velocidadeLinkMbps !== null
          ? `${inv.rede.adaptador} · ${inv.rede.velocidadeLinkMbps} Mbps`
          : inv.rede.adaptador
        : null,
    },
    { label: t('disco'), value: discoPrincipal ? `${discoPrincipal.usadoGb} / ${discoPrincipal.capacidadeGb} GB` : null },
    { label: t('so'), value: inv ? `${inv.os.edicao} · ${inv.os.build}` : null },
    { label: t('monitor'), value: inv?.monitores[0] ? `${inv.monitores[0].resolucao} @ ${inv.monitores[0].taxaHz} Hz` : null },
    { label: t('registros'), value: String(registros) },
  ]

  return (
    <div className="flex min-h-full flex-col gap-4 overflow-x-hidden px-6 pb-5 pt-[22px]">
      <ScreenTitle
        kicker={t('kicker')}
        title={t('titulo')}
        meta={t('meta', { n: PONTOS, procs: procs?.length ?? '—' })}
        actions={
          <>
            {atual?.origin === 'demo' && <DemoTag full />}
            <Button variant="primary" onClick={() => go('windows')}>
              <IconBolt />
              {t('nivelBtn', { n: nivel, nome: tShell(`level.nome.${nivel}` as const) })}
            </Button>
          </>
        }
      />

      {/* elemento dominante: o cluster de instrumentos */}
      <div className="grid flex-none grid-cols-3 gap-4">
        {atual ? (
          <>
            <Instrument
              name={t('cpu')}
              code="INST-01"
              value={atual.cpuUsage}
              peak={picoCpu}
              sublabel={inv?.cpu.nome ?? null}
              onClick={() => go('xray', 'cpu')}
              usoAgora={t('usoAgora')}
              naoDisponivel={naoDisponivel}
              rows={[
                { label: t('clockBase'), value: inv ? `${inv.cpu.clockBaseGhz.toFixed(2)} GHz` : null },
                {
                  label: atual.cpuTempC != null ? t('tempCpu') : t('velocidadeAtual'),
                  value:
                    atual.cpuTempC != null
                      ? `${Math.round(atual.cpuTempC)} °C`
                      : cpuClockAtual != null
                        ? `${cpuClockAtual.toFixed(2)} GHz`
                        : null,
                },
              ]}
            />
            <Instrument
              name={t('gpu')}
              code="INST-02"
              value={atual.gpuUsage}
              peak={picoGpu}
              sublabel={inv?.gpu.nome ?? null}
              onClick={() => go('xray', 'gpu')}
              usoAgora={t('usoAgora')}
              naoDisponivel={naoDisponivel}
              rows={[
                { label: t('vram'), value: inv ? `${inv.gpu.vramGb} GB` : null },
                { label: t('tempGpu'), value: atual.gpuTempC != null ? `${Math.round(atual.gpuTempC)} °C` : null },
              ]}
            />
            <Instrument
              name={t('ram')}
              code="INST-03"
              value={ramPct}
              peak={picoRam}
              sublabel={t('ramGb', { usado: atual.ramUsedGb.toFixed(1), total: atual.ramTotalGb.toFixed(0) })}
              onClick={() => go('xray', 'ram')}
              usoAgora={t('usoAgora')}
              naoDisponivel={naoDisponivel}
              rows={[
                { label: t('emUso'), value: `${atual.ramUsedGb.toFixed(1)} GB` },
                { label: t('disponivel'), value: `${Math.max(0, atual.ramTotalGb - atual.ramUsedGb).toFixed(1)} GB` },
              ]}
            />
          </>
        ) : (
          <>
            <Skeleton className="h-[196px] w-full" />
            <Skeleton className="h-[196px] w-full" />
            <Skeleton className="h-[196px] w-full" />
          </>
        )}
      </div>

      {/* linha do tempo 60 s */}
      <Surface className="flex h-[212px] flex-none flex-col overflow-hidden">
        <div className="surface-head gap-4">
          <span>{t('telemetria')}</span>
          <div className="ml-auto flex items-center gap-[18px]">
            <span className="type-num inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.1em] text-ink-3">
              <span className="inline-block h-[2px] w-4 bg-signal" aria-hidden />
              {t('cpu')}
            </span>
            <span className="type-num inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.1em] text-ink-3">
              <span
                className="inline-block h-[2px] w-4"
                style={{ background: 'repeating-linear-gradient(90deg, #7a7a7a 0 4px, transparent 4px 8px)' }}
                aria-hidden
              />
              {t('gpu')}
            </span>
            {picos.length > 0 && (
              <span className="type-num text-[10px] font-normal tracking-[0.06em] text-ink-3">{picos.join(' · ')}</span>
            )}
          </div>
        </div>
        <div className="relative min-h-0 flex-1 px-4 py-3">
          <svg
            viewBox="0 0 600 120"
            preserveAspectRatio="none"
            className="block h-full w-full"
            role="img"
            aria-label={t('telemetria')}
          >
            {[4, 32, 60, 88, 116].map((y) => (
              <line key={y} x1="10" y1={y} x2="590" y2={y} stroke="#242424" strokeWidth="1" />
            ))}
            {serie.length >= 2 && (
              <>
                {gpuSamples.length >= 2 && (
                  <polyline
                    points={polyPoints(gpuSamples, (m) => m.gpuUsage ?? 0)}
                    fill="none"
                    stroke="#7a7a7a"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <polyline
                  points={polyPoints(serie, (m) => m.cpuUsage)}
                  fill="none"
                  stroke="var(--color-signal)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </svg>
          {serie.length < 2 && (
            <p className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-[0.14em] text-ink-4">
              {t('aguardando')}
            </p>
          )}
        </div>
      </Surface>

      {/* leituras densas + processos em segundo plano */}
      <div className="grid min-h-[272px] flex-1 grid-cols-2 gap-4">
        <Surface className="flex flex-col overflow-hidden">
          <div className="surface-head">{t('leituras')}</div>
          <div className="flex min-h-0 flex-1 flex-col">
            {leituras.map((r, i) => (
              <Reading key={r.label} label={r.label} value={r.value} last={i === leituras.length - 1} />
            ))}
          </div>
        </Surface>

        <Surface className="flex flex-col overflow-hidden">
          <div className="surface-head">
            <span>{t('procTitulo')}</span>
            <div className="ml-auto flex items-center gap-2">
              {procs?.[0]?.origin === 'demo' && <DemoTag />}
              {procs && procs.length > 0 && (
                <span className="pill pill--value text-[10px] font-normal tracking-[0.08em] text-ink-3">
                  {t('lidos', { n: procs.length })}
                </span>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {procs === null && (
              <div className="p-4">
                <Skeleton className="h-32 w-full" />
              </div>
            )}
            {procs?.length === 0 && (
              <p className="flex flex-1 items-center justify-center text-[11px] font-semibold tracking-[0.14em] text-ink-4">
                {t('procVazio')}
              </p>
            )}
            {procs?.map((p, i) => (
              <div
                key={p.pid}
                className={`flex min-h-10 flex-1 items-center gap-3 px-4 ${i === procs.length - 1 ? '' : 'border-b border-line'}`}
              >
                <span className="type-num min-w-0 flex-1 truncate text-xs text-ink-1" title={p.nome}>
                  {p.nome}
                </span>
                <span className="type-num shrink-0 text-xs font-bold text-signal">{p.ramMb} MB</span>
                <Button size="sm" onClick={() => encerrar(p)}>
                  {t('encerrar')}
                </Button>
              </div>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  )
}
