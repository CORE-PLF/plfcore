import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { Gauge } from '../../components/Gauge'
import { Kicker, ScreenTitle } from '../../components/Kicker'
import { MetricRow } from '../../components/MetricRow'
import { Skeleton } from '../../components/states'
import { DemoTag } from '../../components/Tag'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { getInventoryCached } from '../../services/inventoryCache'
import { useLogStore } from '../../stores/log'
import { useKillfeedStore } from '../../stores/killfeed'
import { useNav } from '../../stores/nav'
import { useToastsStore } from '../../stores/toasts'
import type { HardwareInventory, ProcessInfo, SystemMetrics } from '../../types'
import { cockpitDict } from './i18n'

const ProvaRealPanel = lazy(() => import('../provareal/ProvaRealPanel'))

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

// Régua 20–100 °C.
const tempX = (c: number) => 10 + ((Math.max(20, Math.min(100, c)) - 20) / 80) * 580

function fmtUptime(hours: number): string {
  const total = Math.max(0, Math.floor(hours))
  const days = Math.floor(total / 24)
  const remainingHours = total % 24
  return days > 0 ? `${days} d ${remainingHours} h` : `${remainingHours} h`
}

function TempMarker({ c, label, labelY }: { c: number; label: string; labelY: number }) {
  const x = tempX(c)
  return (
    <g>
      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        fill="var(--color-ink-2)"
        fontSize="10"
        fontFamily="var(--font-mono)"
        fontWeight="700"
      >
        {`${label} ${Math.round(c)}°C`}
      </text>
      <polygon points={`${x - 4},${labelY + 4} ${x + 4},${labelY + 4} ${x},${labelY + 10}`} fill="var(--color-heat)" />
    </g>
  )
}

// Moldura de instrumento: parafusos nos cantos + código decorativo.
function Housing({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <Surface cut={8} flat className="relative p-3 pt-4">
      {(
        [
          { top: 5, left: 5 },
          { top: 5, right: 5 },
          { bottom: 5, left: 5 },
          { bottom: 5, right: 5 },
        ] as const
      ).map((pos, i) => (
        <span key={i} className="circle absolute h-[5px] w-[5px] border border-ink-4" style={pos} aria-hidden />
      ))}
      <p className="type-mono pointer-events-none absolute right-4 top-2 text-[8px] tracking-[0.24em] text-ink-4">{code}</p>
      {children}
    </Surface>
  )
}

export default function CockpitScreen() {
  const t = useT(cockpitDict)
  const go = useNav((s) => s.go)
  const registros = useLogStore((s) => s.logs.length)
  const pushFeed = useKillfeedStore((s) => s.push)
  const pushToast = useToastsStore((s) => s.push)

  const [serie, setSerie] = useState<SystemMetrics[]>([])
  const [inv, setInv] = useState<HardwareInventory | null>(null)
  const [procs, setProcs] = useState<ProcessInfo[] | null>(null)
  const [provaOpen, setProvaOpen] = useState(false)

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

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <ScreenTitle kicker={t('kicker')} title={t('titulo')} />
        <div className="flex items-center gap-3">
          {atual?.origin === 'demo' && <DemoTag full />}
          <Button variant="primary" onClick={() => setProvaOpen(true)}>
            {t('provaBtn')}
          </Button>
        </div>
      </div>

      <div>
        <div>
          {/* elemento dominante: o cluster de instrumentos */}
          <div className="grid grid-cols-3 gap-4">
            {atual ? (
              <>
                <Housing code="INST-01">
                  <Gauge
                    fluid
                    value={atual.cpuUsage}
                    peak={picoCpu}
                    label={t('cpu')}
                    sublabel={inv?.cpu.nome ?? null}
                    onClick={() => go('xray', 'cpu')}
                  />
                  <div className="mt-2 border-t border-line pt-1">
                    <MetricRow
                      label={t('clockBase')}
                      value={inv ? `${inv.cpu.clockBaseGhz.toFixed(2)} GHz` : null}
                    />
                    <MetricRow
                      label={atual.cpuTempC != null ? t('tempCpu') : t('velocidadeAtual')}
                      value={
                        atual.cpuTempC != null
                          ? `${Math.round(atual.cpuTempC)} °C`
                          : cpuClockAtual != null
                            ? `${cpuClockAtual.toFixed(2)} GHz`
                            : null
                      }
                    />
                  </div>
                </Housing>
                <Housing code="INST-02">
                  <Gauge
                    fluid
                    value={atual.gpuUsage}
                    peak={picoGpu}
                    label={t('gpu')}
                    sublabel={inv?.gpu.nome ?? null}
                    onClick={() => go('xray', 'gpu')}
                  />
                  <div className="mt-2 border-t border-line pt-1">
                    <MetricRow label={t('vram')} value={inv ? `${inv.gpu.vramGb} GB` : null} />
                    <MetricRow
                      label={t('tempGpu')}
                      value={atual.gpuTempC != null ? `${Math.round(atual.gpuTempC)} °C` : null}
                    />
                  </div>
                </Housing>
                <Housing code="INST-03">
                  <Gauge
                    fluid
                    value={ramPct}
                    peak={picoRam}
                    label={t('ram')}
                    sublabel={t('ramGb', { usado: atual.ramUsedGb.toFixed(1), total: atual.ramTotalGb.toFixed(0) })}
                    onClick={() => go('xray', 'ram')}
                  />
                  <div className="mt-2 border-t border-line pt-1">
                    <MetricRow label={t('emUso')} value={`${atual.ramUsedGb.toFixed(1)} GB`} />
                    <MetricRow
                      label={t('disponivel')}
                      value={`${Math.max(0, atual.ramTotalGb - atual.ramUsedGb).toFixed(1)} GB`}
                    />
                  </div>
                </Housing>
              </>
            ) : (
              <>
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </>
            )}
          </div>

          {/* linha do tempo 60 s */}
          <Surface cut={8} className="mt-6 p-5">
            <div className="flex items-center justify-between">
              <Kicker>{t('telemetria')}</Kicker>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-2 type-mono text-[10px] font-bold tracking-[0.12em] text-ink-3">
                  <span className="inline-block h-[2px] w-4" style={{ background: 'var(--color-heat)' }} aria-hidden />
                  {t('cpu')}
                </span>
                <span className="flex items-center gap-2 type-mono text-[10px] font-bold tracking-[0.12em] text-ink-3">
                  <span
                    className="inline-block h-[2px] w-4"
                    style={{
                      background:
                        'repeating-linear-gradient(90deg, var(--color-heat) 0 4px, transparent 4px 7px)',
                    }}
                    aria-hidden
                  />
                  {t('gpu')}
                </span>
              </div>
            </div>
            <div className="relative mt-3">
              <svg viewBox="0 0 600 120" className="block w-full" role="img" aria-label={t('telemetria')}>
                {[4, 32, 60, 88, 116].map((y) => (
                  <line key={y} x1="10" y1={y} x2="590" y2={y} stroke="rgba(255,255,255,.06)" strokeWidth="1" />
                ))}
                {serie.length >= 2 && (
                  <>
                    {serie.some((m) => m.gpuUsage !== null) && (
                      <polyline
                        points={polyPoints(
                          serie.filter((m) => m.gpuUsage !== null),
                          (m) => m.gpuUsage ?? 0,
                        )}
                        fill="none"
                        stroke="var(--color-heat)"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        opacity=".55"
                      />
                    )}
                    <polyline
                      points={polyPoints(serie, (m) => m.cpuUsage)}
                      fill="none"
                      stroke="var(--color-heat)"
                      strokeWidth="2"
                    />
                  </>
                )}
              </svg>
              {serie.length < 2 && (
                <p className="absolute inset-0 flex items-center justify-center type-mono text-xs tracking-[0.14em] text-ink-4">
                  {t('aguardando')}
                </p>
              )}
            </div>

            {/* régua de temperatura */}
            <div className="mt-5">
              <Kicker>{t('temperatura')}</Kicker>
              <svg viewBox="0 0 600 56" className="mt-2 block w-full" aria-hidden>
                <line x1="10" y1="34" x2="590" y2="34" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
                <line x1={tempX(85)} y1="34" x2="590" y2="34" stroke="var(--color-rust)" strokeWidth="5" />
                <line x1={tempX(85)} y1="34" x2="590" y2="34" stroke="var(--color-signal)" strokeWidth="1" opacity=".7" />
                {[20, 30, 40, 50, 60, 70, 80, 90, 100].map((c) => (
                  <line key={c} x1={tempX(c)} y1="34" x2={tempX(c)} y2="40" stroke="rgba(255,255,255,.25)" strokeWidth="1" />
                ))}
                {[20, 40, 60, 80, 100].map((c) => (
                  <text
                    key={c}
                    x={tempX(c)}
                    y="52"
                    textAnchor="middle"
                    fill="var(--color-ink-4)"
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                  >
                    {c}
                  </text>
                ))}
                {atual?.cpuTempC != null && <TempMarker c={atual.cpuTempC} label={t('cpu')} labelY={10} />}
                {atual?.gpuTempC != null && <TempMarker c={atual.gpuTempC} label={t('gpu')} labelY={24} />}
              </svg>
              <div className="mt-2 grid grid-cols-2 gap-x-8">
                <MetricRow
                  label={atual?.cpuTempC != null ? t('tempCpu') : t('velocidadeAtual')}
                  value={
                    atual?.cpuTempC != null
                      ? `${Math.round(atual.cpuTempC)} °C`
                      : cpuClockAtual != null
                        ? `${cpuClockAtual.toFixed(2)} GHz`
                        : null
                  }
                />
                <MetricRow label={t('tempGpu')} value={atual?.gpuTempC != null ? `${Math.round(atual.gpuTempC)} °C` : null} />
              </div>
            </div>
          </Surface>

          {/* leituras densas + processos em segundo plano */}
          <div className="mt-6 grid grid-cols-2 gap-6">
            <Surface cut={8} flat className="scanlines p-5">
              <Kicker>{t('leituras')}</Kicker>
              <div className="mt-2">
                <MetricRow
                  label={t('uptime')}
                  value={
                    inv
                      ? `${fmtUptime(inv.os.uptimeHoras)} · ${t(
                          inv.os.uptimeHoras >= 72
                            ? 'uptimeReiniciar'
                            : inv.os.uptimeHoras >= 24
                              ? 'uptimeContinuo'
                              : 'uptimeRecente',
                        )}`
                      : null
                  }
                />
                <MetricRow label={t('plano')} value={inv?.energia.planoAtivo ?? null} />
                <MetricRow
                  label={t('rede')}
                  value={
                    inv
                      ? inv.rede.velocidadeLinkMbps !== null
                        ? `${inv.rede.adaptador} · ${inv.rede.velocidadeLinkMbps} Mbps`
                        : inv.rede.adaptador
                      : null
                  }
                />
                <MetricRow
                  label={t('disco')}
                  value={discoPrincipal ? `${discoPrincipal.usadoGb} / ${discoPrincipal.capacidadeGb} GB` : null}
                />
                <MetricRow label={t('so')} value={inv ? `${inv.os.edicao} · ${inv.os.build}` : null} />
                <MetricRow
                  label={t('monitor')}
                  value={inv?.monitores[0] ? `${inv.monitores[0].resolucao} @ ${inv.monitores[0].taxaHz} Hz` : null}
                />
                <MetricRow label={t('registros')} value={String(registros)} />
              </div>
            </Surface>

            <Surface cut={8} flat className="p-5">
              <div className="flex items-baseline justify-between">
                <Kicker>{t('procTitulo')}</Kicker>
                {procs?.[0]?.origin === 'demo' && <DemoTag />}
              </div>
              <div className="mt-2">
                {procs === null && <Skeleton className="h-32 w-full" />}
                {procs?.length === 0 && (
                  <p className="type-mono mt-4 text-xs tracking-[0.14em] text-ink-4">{t('procVazio')}</p>
                )}
                {procs?.map((p) => (
                  <div key={p.pid} className="flex items-center gap-3 border-b border-line py-1">
                    <span className="type-mono min-w-0 flex-1 truncate text-xs text-ink-1">{p.nome}</span>
                    <span className="type-mono shrink-0 text-xs font-bold text-heat">{p.ramMb} MB</span>
                    <Button size="sm" variant="danger" onClick={() => encerrar(p)}>
                      {t('encerrar')}
                    </Button>
                  </div>
                ))}
              </div>
            </Surface>
          </div>
        </div>

      </div>

      <Suspense fallback={null}>
        <ProvaRealPanel open={provaOpen} onClose={() => setProvaOpen(false)} />
      </Suspense>
    </div>
  )
}
