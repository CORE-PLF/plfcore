import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HealthBadge } from '../../components/HealthBadge'
import { ScreenTitle } from '../../components/Kicker'
import { MetricRow } from '../../components/MetricRow'
import { ScanLine } from '../../components/ScanLine'
import { ProgressBar } from '../../components/ProgressBar'
import { DemoTag, EstimatedTag } from '../../components/Tag'
import { ErrorState, Skeleton } from '../../components/states'
import { IconChevron } from '../../components/icons'
import { kitDict } from '../../components/i18n'
import { useLocaleStore, useT, type Locale } from '../../i18n'
import { BRAND } from '../../brand'
import { getAdapter } from '../../services/adapter'
import { getInventoryCached, getMachineRecordCached, invalidateInventory } from '../../services/inventoryCache'
import { useNav } from '../../stores/nav'
import { useToastsStore } from '../../stores/toasts'
import type { HardwareInventory, MachineRecord, SystemMetrics } from '../../types'
import { Blueprint, type SectionId } from './Blueprint'
import { gerarFichaPng, type CardLine } from './exportCard'
import { dict } from './i18n'
import './xray.css'

const LOCALE_TAG: Record<Locale, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
}

const TITLE_KEY = {
  cpu: 'sCpu',
  board: 'sBoard',
  memory: 'sMemoria',
  gpu: 'sVideo',
  network: 'sRede',
  monitors: 'sMonitores',
  audio: 'sAudio',
  power: 'sEnergia',
  peripherals: 'sPerifericos',
  os: 'sSistema',
} as const

const fmtInt = (n: number, tag: string) => n.toLocaleString(tag)
const fmtNum1 = (n: number, tag: string) =>
  n.toLocaleString(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
function fmtDate(iso: string, tag: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(tag)
}

/** Valor curto rotulado da plaqueta (dog tag). */
function Stat({ label, sub, value, accent }: { label: string; sub?: string; value: string | null; accent?: boolean }) {
  const tk = useT(kitDict)
  return (
    <div>
      <p className="type-kicker">{label}</p>
      <p className={`type-mono text-sm font-bold ${value === null ? 'text-ink-4' : accent ? 'text-signal' : 'text-ink-1'}`}>
        {value ?? tk('naoDisponivel')}
      </p>
      {sub && <p className="type-mono mt-0.5 text-[9px] tracking-[0.12em] text-ink-4">{sub}</p>}
    </div>
  )
}

/** Linha com dado ao vivo: LED + selo ESTIMADO quando a métrica não é medida. */
function LiveRow({ label, value, estimated }: { label: string; value: string; estimated: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-[5px]">
      <span className="type-kicker shrink-0">{label}</span>
      <span className="flex items-center gap-2">
        {estimated && <EstimatedTag />}
        <span className="led circle led--live" aria-hidden />
        <span className="type-mono text-xs font-bold text-ink-1">{value}</span>
      </span>
    </div>
  )
}

interface FichaProps {
  id: SectionId
  num: string
  title: string
  selected: boolean
  onHot: (id: SectionId | null) => void
  register: (id: SectionId, el: HTMLDivElement | null) => void
  extra?: ReactNode
  children: ReactNode
}

function Ficha({ id, num, title, selected, onHot, register, extra, children }: FichaProps) {
  return (
    <div
      ref={(el) => {
        register(id, el)
      }}
    >
      <Surface
        flat
        cut={6}
        brackets={selected}
        className="p-4"
        onMouseEnter={() => onHot(id)}
        onMouseLeave={() => onHot(null)}
      >
        <header className="mb-2 flex items-center gap-2">
          <span className="type-mono border border-edge px-1.5 py-0.5 text-[10px] font-bold text-ink-3">{num}</span>
          <h2 className="type-display text-lg">{title}</h2>
          {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
        </header>
        {children}
      </Surface>
    </div>
  )
}

/** Linha de chamada do componente do blueprint até a ficha correspondente. */
function CalloutOverlay({
  container,
  activeId,
  fichas,
}: {
  container: RefObject<HTMLDivElement | null>
  activeId: SectionId | null
  fichas: RefObject<Map<SectionId, HTMLDivElement>>
}) {
  const [ln, setLn] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  useEffect(() => {
    if (!activeId) {
      setLn(null)
      return
    }
    const update = () => {
      const cont = container.current
      const part = cont?.querySelector(`[data-bp="${activeId}"]`)
      const ficha = fichas.current.get(activeId)
      if (!cont || !part || !ficha) {
        setLn(null)
        return
      }
      const c = cont.getBoundingClientRect()
      const p = part.getBoundingClientRect()
      const f = ficha.getBoundingClientRect()
      setLn({
        x1: p.right - c.left + 4,
        y1: p.top + p.height / 2 - c.top,
        x2: f.left - c.left - 3,
        y2: f.top + 16 - c.top,
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [activeId, container, fichas])

  if (!ln) return null
  return (
    <svg className="xr-callout" aria-hidden>
      <path d={`M ${ln.x1} ${ln.y1} H ${ln.x2 - 16} V ${ln.y2} H ${ln.x2}`} />
      <rect x={ln.x1 - 2} y={ln.y1 - 2} width={4} height={4} />
      <rect x={ln.x2 - 2} y={ln.y2 - 2} width={4} height={4} />
    </svg>
  )
}

export default function XRayScreen() {
  const t = useT(dict)
  const tk = useT(kitDict)
  const locale = useLocaleStore((s) => s.locale)
  const tag = LOCALE_TAG[locale]
  const go = useNav((s) => s.go)
  const anchor = useNav((s) => s.anchor)
  const pushToast = useToastsStore((s) => s.push)

  const [inv, setInv] = useState<HardwareInventory | null>(null)
  const [rec, setRec] = useState<MachineRecord | null>(null)
  const [err, setErr] = useState(false)
  const [m, setM] = useState<SystemMetrics | null>(null)
  const [hot, setHot] = useState<SectionId | null>(null)
  const [sel, setSel] = useState<SectionId | null>(null)
  const [scan, setScan] = useState(true)
  const [exporting, setExporting] = useState(false)

  const layoutRef = useRef<HTMLDivElement>(null)
  const fichaRefs = useRef<Map<SectionId, HTMLDivElement>>(new Map())

  const load = useCallback(() => {
    setErr(false)
    Promise.all([getInventoryCached(), getMachineRecordCached()])
      .then(([i, r]) => {
        setInv(i)
        setRec(r)
      })
      .catch(() => setErr(true))
  }, [])

  useEffect(load, [load])
  useEffect(() => getAdapter().streamMetrics(setM), [])

  useEffect(() => {
    if (!inv || !anchor) return
    const map: Partial<Record<string, SectionId>> = { cpu: 'cpu', gpu: 'gpu', ram: 'memory' }
    const id = map[anchor]
    if (!id) return
    setSel(id)
    const raf = requestAnimationFrame(() => {
      fichaRefs.current.get(id)?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(raf)
  }, [inv, anchor])

  const register = useCallback((id: SectionId, el: HTMLDivElement | null) => {
    if (el) fichaRefs.current.set(id, el)
    else fichaRefs.current.delete(id)
  }, [])

  const onHot = useCallback((id: SectionId | null) => setHot(id), [])

  const onPick = useCallback(
    (id: SectionId) => {
      if (sel === id) {
        setSel(null)
        return
      }
      setSel(id)
      fichaRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    },
    [sel],
  )

  const retry = useCallback(() => {
    invalidateInventory()
    setInv(null)
    setRec(null)
    load()
  }, [load])

  async function onExport() {
    if (!inv || !rec) return
    setExporting(true)
    try {
      const lines: CardLine[] = [
        { label: t('sCpu'), value: inv.cpu.nome },
        { label: t('sVideo'), value: `${inv.gpu.nome} · ${inv.gpu.vramGb} GB` },
        {
          label: t('sMemoria'),
          value: `${inv.memoria.totalGb} GB ${inv.memoria.tecnologia} · ${inv.memoria.velocidadeMhz} MHz`,
        },
        { label: t('sBoard'), value: `${inv.board.fabricante} ${inv.board.modelo}` },
        {
          label: t('sArmazenamento'),
          value: inv.discos.length
            ? inv.discos.map((d) => `${d.capacidadeGb} GB ${d.tipo}`).join(' + ')
            : tk('naoDisponivel'),
        },
        { label: t('sSistema'), value: inv.os.edicao },
      ]
      const url = await gerarFichaPng(inv, rec, lines, {
        demo: tk('modoDemonstracao'),
        emServico: t('emServico'),
        assinatura: t('assinatura'),
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `${BRAND.shortName.toLowerCase()}-${rec.hostname.toLowerCase()}.png`
      a.click()
      pushToast({ tipo: 'sucesso', mensagem: t('exportOk') })
    } catch {
      pushToast({ tipo: 'erro', mensagem: t('exportErr') })
    } finally {
      setExporting(false)
    }
  }

  if (err) {
    return (
      <div className="p-8">
        <ScreenTitle kicker={t('kicker')} title={t('title')} />
        <div className="max-w-xl">
          <ErrorState what={t('erroLer')} todo={t('erroLerTodo')} onRetry={retry} />
        </div>
      </div>
    )
  }

  if (!inv || !rec) {
    return (
      <div className="p-8">
        <ScreenTitle kicker={t('kicker')} title={t('title')} />
        <Skeleton className="mb-6 h-28 w-full" />
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
          <Skeleton className="h-[480px]" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        </div>
      </div>
    )
  }

  const sections: SectionId[] = [
    'cpu',
    'board',
    'memory',
    'gpu',
    ...inv.discos.map((_, i) => `disk-${i}` as SectionId),
    'network',
    'monitors',
    'audio',
    'power',
    'peripherals',
    'os',
  ]
  const numOf = (id: SectionId) => String(sections.indexOf(id) + 1).padStart(2, '0')
  const ariaOf = (id: SectionId): string => {
    if (id.startsWith('disk-')) {
      const d = inv.discos[Number(id.slice(5))]
      return d ? `${t('sArmazenamento')} — ${d.modelo}` : t('sArmazenamento')
    }
    return t(TITLE_KEY[id as keyof typeof TITLE_KEY])
  }

  const active = hot ?? sel
  const usoAtual = m ? m.cpuUsage : inv.cpu.usoPct
  const tempAtual = m?.cpuTempC ?? inv.cpu.tempC
  const clockAtual = m?.cpuClockGhz ?? inv.cpu.clockAtualGhz
  const bateria = inv.energia.bateria

  return (
    <div className="p-8">
      <ScreenTitle kicker={t('kicker')} title={t('title')} />

      {/* registro da máquina — plaqueta */}
      <Surface cut={8} className="relative">
        <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />
        <div className="flex flex-wrap items-center gap-6 p-5 pt-6">
          <span className="circle h-4 w-4 shrink-0 border border-ink-4" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="type-display text-3xl">{rec.hostname}</span>
              {inv.origin === 'demo' && <DemoTag full />}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
              <Stat label={t('emServico')} value={fmtDate(rec.emServicoDesde, tag)} />
              <Stat
                label={t('horasOp')}
                sub={t('horasOpFonte')}
                value={rec.horasOperacao !== null ? `${fmtInt(rec.horasOperacao, tag)} h` : null}
              />
              <Stat label={t('serialBios')} value={rec.serialBios} />
              <Stat label={t('assinatura')} value={rec.assinatura.toUpperCase()} accent />
            </div>
          </div>
          <Button variant="primary" onClick={onExport} disabled={exporting}>
            {t('exportar')}
          </Button>
        </div>
      </Surface>

      <div ref={layoutRef} className="relative mt-6 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-6">
        {/* blueprint — elemento dominante */}
        <div className="sticky top-6">
          <Surface flat cut={8}>
            <div className="stage-grid relative overflow-hidden p-4">
              <ScanLine durationS={4} active={scan} />
              <Blueprint
                inv={inv}
                active={active}
                selected={sel}
                numOf={numOf}
                ariaOf={ariaOf}
                livre={t('livre')}
                naoDetectado={t('naoDetectado')}
                ariaDiagram={t('bpAria')}
                onHot={onHot}
                onPick={onPick}
              />
              <div className="absolute right-3 top-3 z-10">
                <Button size="sm" aria-pressed={scan} onClick={() => setScan((v) => !v)}>
                  <span className={`led circle ${scan ? 'led--live' : 'led--off'}`} aria-hidden />
                  {t('varredura')} {scan ? t('ligada') : t('desligada')}
                </Button>
              </div>
            </div>
          </Surface>
        </div>

        {/* inventário — fichas densas */}
        <div className="flex min-w-0 flex-col gap-4">
          <Ficha id="cpu" num={numOf('cpu')} title={t('sCpu')} selected={sel === 'cpu'} onHot={onHot} register={register}>
            <MetricRow label={t('modelo')} value={inv.cpu.nome} />
            <MetricRow label={t('nucleosThreads')} value={`${inv.cpu.nucleos} / ${inv.cpu.threads}`} />
            <MetricRow label={t('clockBase')} value={`${fmtNum1(inv.cpu.clockBaseGhz, tag)} GHz`} />
            <MetricRow label={t('clockAtual')} value={`${clockAtual.toFixed(2)} GHz`} />
            <MetricRow label={t('cacheL2')} value={`${inv.cpu.cacheL2Mb} MB`} />
            <MetricRow label={t('cacheL3')} value={`${inv.cpu.cacheL3Mb} MB`} />
            <MetricRow label={t('soquete')} value={inv.cpu.soquete} />
            {tempAtual !== null && <MetricRow label={t('temperatura')} value={`${tempAtual} °C`} />}
            <LiveRow label={t('usoVivo')} value={`${fmtNum1(usoAtual, tag)}%`} estimated={m?.origin === 'estimated'} />
          </Ficha>

          <Ficha id="board" num={numOf('board')} title={t('sBoard')} selected={sel === 'board'} onHot={onHot} register={register}>
            <MetricRow label={t('fabricante')} value={inv.board.fabricante} />
            <MetricRow label={t('modelo')} value={inv.board.modelo} />
            <MetricRow label={t('chipset')} value={inv.board.chipset} />
            <MetricRow label={t('bios')} value={inv.board.biosVersao} />
            <MetricRow label={t('biosData')} value={inv.board.biosData ? fmtDate(inv.board.biosData, tag) : null} />
            <MetricRow label={t('firmware')} value={inv.board.modoUefi ? 'UEFI' : 'LEGACY'} />
            <MetricRow
              label={t('secureBoot')}
              value={inv.board.secureBoot === null ? null : inv.board.secureBoot ? t('ativado') : t('desativado')}
            />
          </Ficha>

          <Ficha id="memory" num={numOf('memory')} title={t('sMemoria')} selected={sel === 'memory'} onHot={onHot} register={register}>
            <MetricRow label={t('total')} value={`${inv.memoria.totalGb} GB`} />
            <MetricRow label={t('velocidade')} value={`${inv.memoria.velocidadeMhz} MHz`} />
            <MetricRow label={t('tecnologia')} value={inv.memoria.tecnologia} />
            <MetricRow
              label={t('canal')}
              value={inv.memoria.canal === null ? null : inv.memoria.canal === 'dual' ? t('canalDual') : t('canalSingle')}
            />
            {inv.memoria.sticks.map((s) => (
              <MetricRow
                key={s.slot}
                label={s.slot}
                value={
                  s.ocupado
                    ? `${s.capacidadeGb} GB · ${s.velocidadeMhz} MHz${s.fabricante ? ` · ${s.fabricante}` : ''}`
                    : t('livre')
                }
              />
            ))}
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={() => go('memory')}>
                {t('abrirAnalise')} <IconChevron width={12} height={12} />
              </Button>
            </div>
          </Ficha>

          <Ficha id="gpu" num={numOf('gpu')} title={t('sVideo')} selected={sel === 'gpu'} onHot={onHot} register={register}>
            <MetricRow label={t('modelo')} value={inv.gpu.nome} />
            <MetricRow label={t('vram')} value={`${inv.gpu.vramGb} GB`} />
            <MetricRow label={t('driver')} value={inv.gpu.driverVersao} />
            <MetricRow label={t('driverData')} value={inv.gpu.driverData ? fmtDate(inv.gpu.driverData, tag) : null} />
            <MetricRow label={t('resolucao')} value={inv.gpu.resolucaoAtiva} />
            <MetricRow label={t('taxa')} value={`${inv.gpu.taxaHz} Hz`} />
          </Ficha>

          {inv.discos.map((d, i) => {
            const id = `disk-${i}` as SectionId
            const pct = d.capacidadeGb > 0 ? Math.round((d.usadoGb / d.capacidadeGb) * 100) : 0
            return (
              <Ficha
                key={id}
                id={id}
                num={numOf(id)}
                title={`${t('sArmazenamento')} ${i + 1}`}
                selected={sel === id}
                onHot={onHot}
                register={register}
                extra={<HealthBadge status={d.smart.status} />}
              >
                <MetricRow label={t('modelo')} value={d.modelo} />
                <MetricRow label={t('tipo')} value={d.tipo} />
                <MetricRow label={t('capacidade')} value={`${fmtInt(d.capacidadeGb, tag)} GB`} />
                <div className="border-b border-line py-[5px]">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="type-kicker shrink-0">{t('emUso')}</span>
                    <span className="type-mono text-xs font-bold text-ink-1">
                      {fmtInt(d.usadoGb, tag)} GB · {pct}%
                    </span>
                  </div>
                  <ProgressBar pct={pct} segments={24} showPct={false} className="mt-1.5" />
                </div>
                <MetricRow label={t('temperatura')} value={d.tempC !== null ? `${d.tempC} °C` : null} />
                <MetricRow label={t('particoes')} value={d.particoes.length ? d.particoes.join(' · ') : null} />
                <MetricRow
                  label={t('horasLigadas')}
                  value={d.smart.horasLigadas !== null ? `${fmtInt(d.smart.horasLigadas, tag)} h` : null}
                />
                <MetricRow label={t('ciclos')} value={d.smart.ciclos !== null ? fmtInt(d.smart.ciclos, tag) : null} />
                <MetricRow label={t('tbw')} value={d.smart.tbw !== null ? `${fmtInt(d.smart.tbw, tag)} TB` : null} />
              </Ficha>
            )
          })}

          <Ficha id="network" num={numOf('network')} title={t('sRede')} selected={sel === 'network'} onHot={onHot} register={register}>
            <MetricRow label={t('adaptador')} value={inv.rede.adaptador} />
            <MetricRow
              label={t('linkSpeed')}
              value={inv.rede.velocidadeLinkMbps !== null ? `${fmtInt(inv.rede.velocidadeLinkMbps, tag)} Mb/s` : null}
            />
            <MetricRow label={t('ipv4')} value={inv.rede.ipv4} />
            <MetricRow label={t('gateway')} value={inv.rede.gateway} />
            <MetricRow label={t('mac')} value={inv.rede.mac} />
            <MetricRow label={t('dhcp')} value={inv.rede.dhcp === null ? null : inv.rede.dhcp ? t('sim') : t('nao')} />
          </Ficha>

          <Ficha id="monitors" num={numOf('monitors')} title={t('sMonitores')} selected={sel === 'monitors'} onHot={onHot} register={register}>
            {inv.monitores.length === 0 && <MetricRow label={t('sMonitores')} value={null} />}
            {inv.monitores.map((mon, i) => (
              <MetricRow
                key={i}
                label={`M${i + 1}`}
                value={[
                  [mon.fabricante, mon.modelo].filter(Boolean).join(' '),
                  // modo ativo só é conhecido para o monitor principal — nunca inventar 0 Hz
                  mon.resolucao && mon.taxaHz !== null && mon.taxaHz > 0 ? `${mon.resolucao} @ ${mon.taxaHz} Hz` : null,
                  mon.principal ? t('principal') : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || null}
              />
            ))}
          </Ficha>

          <Ficha id="audio" num={numOf('audio')} title={t('sAudio')} selected={sel === 'audio'} onHot={onHot} register={register}>
            <MetricRow label={t('saidaPadrao')} value={inv.audio.saidaPadrao} />
            <MetricRow
              label={t('dispositivos')}
              value={inv.audio.dispositivos.length ? inv.audio.dispositivos.join(' · ') : null}
            />
          </Ficha>

          <Ficha id="power" num={numOf('power')} title={t('sEnergia')} selected={sel === 'power'} onHot={onHot} register={register}>
            <MetricRow label={t('planoAtivo')} value={inv.energia.planoAtivo} />
            <MetricRow
              label={t('bateria')}
              value={bateria ? `${bateria.percentual}%${bateria.carregando ? ` · ${t('emCarga')}` : ''}` : null}
            />
          </Ficha>

          <Ficha id="peripherals" num={numOf('peripherals')} title={t('sPerifericos')} selected={sel === 'peripherals'} onHot={onHot} register={register}>
            <MetricRow label={t('portasUsb')} value={String(inv.perifericos.usbCount)} />
            <MetricRow label={t('mouse')} value={inv.perifericos.mouse} />
            <MetricRow label={t('teclado')} value={inv.perifericos.teclado} />
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={() => go('latency')}>
                {t('abrirLatencia')} <IconChevron width={12} height={12} />
              </Button>
            </div>
          </Ficha>

          <Ficha id="os" num={numOf('os')} title={t('sSistema')} selected={sel === 'os'} onHot={onHot} register={register}>
            <MetricRow label={t('edicao')} value={inv.os.edicao} />
            <MetricRow label={t('build')} value={inv.os.build} />
            <MetricRow label={t('instalacao')} value={fmtDate(inv.os.dataInstalacao, tag)} />
            <MetricRow label={t('uptime')} value={`${fmtInt(inv.os.uptimeHoras, tag)} h`} />
          </Ficha>
        </div>

        <CalloutOverlay container={layoutRef} activeId={active} fichas={fichaRefs} />
      </div>
    </div>
  )
}
