import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HealthBadge } from '../../components/HealthBadge'
import { ScreenTitle } from '../../components/Kicker'
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

/** Valor rotulado do registro da máquina. */
function Stat({ label, sub, value, accent }: { label: string; sub?: string; value: string | null; accent?: boolean }) {
  const tk = useT(kitDict)
  return (
    <div className="min-w-0">
      <p className="type-kicker">{label}</p>
      <p
        className={`type-num mt-1 truncate text-[18px] font-bold leading-tight max-[1400px]:text-[15px] ${value === null ? 'text-ink-4' : accent ? 'text-signal' : 'text-ink-1'}`}
        title={value ?? undefined}
      >
        {value ?? tk('naoDisponivel')}
      </p>
      {sub && <p className="mt-0.5 text-[10px] tracking-[0.08em] text-ink-4">{sub}</p>}
    </div>
  )
}

/** Linha de dado: rótulo caps à esquerda, valor tabular à direita. null = NÃO DISPONÍVEL. */
function Row({ label, value, children }: { label: string; value: string | null; children?: ReactNode }) {
  const tk = useT(kitDict)
  return (
    <div className="datarow">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {children}
        <span className={`type-num truncate text-xs font-bold ${value === null ? 'text-ink-4' : 'text-ink-1'}`} title={value ?? undefined}>
          {value ?? tk('naoDisponivel')}
        </span>
      </span>
    </div>
  )
}

/** Linha com dado ao vivo: LED + selo ESTIMADO quando a métrica não é medida. */
function LiveRow({ label, value, estimated }: { label: string; value: string; estimated: boolean }) {
  return (
    <Row label={label} value={value}>
      {estimated && <EstimatedTag />}
      <span className="led circle led--live" aria-hidden />
    </Row>
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
        className="overflow-hidden"
        edge={selected ? 'var(--color-signal)' : undefined}
        onMouseEnter={() => onHot(id)}
        onMouseLeave={() => onHot(null)}
      >
        <header className="surface-head gap-2 py-1.5 max-[1400px]:flex-wrap" style={{ minHeight: 40, paddingInline: 14 }}>
          <span
            className={`type-num shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] ${selected ? 'bg-signal text-void' : 'bg-surface-3 text-ink-2'}`}
          >
            {num}
          </span>
          <h2 className="truncate text-xs font-bold tracking-[0.1em] text-ink-1 max-[1400px]:tracking-[0.04em]" title={title}>
            {title}
          </h2>
          {extra && <div className="ml-auto flex shrink-0 items-center gap-2">{extra}</div>}
        </header>
        <div className="p-3">
          <div className="flex flex-col gap-px overflow-hidden rounded-[6px]">{children}</div>
        </div>
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
        y2: f.top + 20 - c.top,
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
      <circle cx={ln.x1} cy={ln.y1} r={2.5} />
      <circle cx={ln.x2} cy={ln.y2} r={2.5} />
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
        <Skeleton className="mb-4 h-28 w-full" />
        <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
          <Skeleton className="h-[560px]" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
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
    <div className="h-full overflow-y-auto p-8">
      <ScreenTitle
        kicker={t('kicker')}
        title={t('title')}
        meta={t('meta', { host: rec.hostname, n: sections.length })}
        actions={
          <>
            {inv.origin === 'demo' && <DemoTag full />}
            <Button variant="primary" onClick={onExport} disabled={exporting}>
              {t('exportar')}
            </Button>
          </>
        }
      />

      {/* registro da máquina */}
      <Surface className="overflow-hidden">
        <div className="surface-head">
          <span>{t('registro')}</span>
          <span className="type-num ml-auto text-[10px] font-normal tracking-[0.18em] text-ink-3">{rec.serialBios ?? ''}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] items-end gap-6 px-4 py-4 max-[1400px]:gap-4">
          <div className="min-w-0">
            <p className="type-kicker">{t('hostname')}</p>
            <p className="type-num mt-1 truncate text-[32px] font-bold leading-none text-ink-1 max-[1400px]:text-[24px]" title={rec.hostname}>
              {rec.hostname}
            </p>
          </div>
          <Stat label={t('emServico')} value={fmtDate(rec.emServicoDesde, tag)} />
          <Stat
            label={t('horasOp')}
            sub={t('horasOpFonte')}
            value={rec.horasOperacao !== null ? `${fmtInt(rec.horasOperacao, tag)} h` : null}
          />
          <Stat label={t('serialBios')} value={rec.serialBios} />
          <Stat label={t('assinatura')} value={rec.assinatura.toUpperCase()} accent />
        </div>
      </Surface>

      <div ref={layoutRef} className="relative mt-4 grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-4">
        {/* blueprint — elemento dominante */}
        <div className="sticky top-0">
          <Surface className="overflow-hidden">
            <div className="surface-head">
              <span>{t('sBoard')}</span>
              <span className="type-num ml-auto truncate text-[10px] font-normal tracking-[0.18em] text-ink-3">
                {[inv.board.fabricante, inv.board.modelo].filter(Boolean).join(' ').toUpperCase() || t('naoDetectado')}
              </span>
            </div>
            <div className="p-4">
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
            </div>
          </Surface>
        </div>

        {/* inventário — grade de cards por componente */}
        <div className="grid min-w-0 grid-cols-2 items-start gap-4 max-[1400px]:gap-3">
          <Ficha id="cpu" num={numOf('cpu')} title={t('sCpu')} selected={sel === 'cpu'} onHot={onHot} register={register}>
            <Row label={t('modelo')} value={inv.cpu.nome} />
            <Row label={t('nucleosThreads')} value={`${inv.cpu.nucleos} / ${inv.cpu.threads}`} />
            <Row label={t('clockBase')} value={`${fmtNum1(inv.cpu.clockBaseGhz, tag)} GHz`} />
            <Row label={t('clockAtual')} value={`${clockAtual.toFixed(2)} GHz`} />
            <Row label={t('cacheL2')} value={`${inv.cpu.cacheL2Mb} MB`} />
            <Row label={t('cacheL3')} value={`${inv.cpu.cacheL3Mb} MB`} />
            <Row label={t('soquete')} value={inv.cpu.soquete} />
            {tempAtual !== null && <Row label={t('temperatura')} value={`${tempAtual} °C`} />}
            <LiveRow label={t('usoVivo')} value={`${fmtNum1(usoAtual, tag)}%`} estimated={m?.origin === 'estimated'} />
          </Ficha>

          <Ficha id="board" num={numOf('board')} title={t('sBoard')} selected={sel === 'board'} onHot={onHot} register={register}>
            <Row label={t('fabricante')} value={inv.board.fabricante} />
            <Row label={t('modelo')} value={inv.board.modelo} />
            <Row label={t('chipset')} value={inv.board.chipset} />
            <Row label={t('bios')} value={inv.board.biosVersao} />
            <Row label={t('biosData')} value={inv.board.biosData ? fmtDate(inv.board.biosData, tag) : null} />
            <Row label={t('firmware')} value={inv.board.modoUefi ? 'UEFI' : 'LEGACY'} />
            <Row
              label={t('secureBoot')}
              value={inv.board.secureBoot === null ? null : inv.board.secureBoot ? t('ativado') : t('desativado')}
            />
          </Ficha>

          <Ficha id="memory" num={numOf('memory')} title={t('sMemoria')} selected={sel === 'memory'} onHot={onHot} register={register}>
            <Row label={t('total')} value={`${inv.memoria.totalGb} GB`} />
            <Row label={t('velocidade')} value={`${inv.memoria.velocidadeMhz} MHz`} />
            <Row label={t('tecnologia')} value={inv.memoria.tecnologia} />
            <Row
              label={t('canal')}
              value={inv.memoria.canal === null ? null : inv.memoria.canal === 'dual' ? t('canalDual') : t('canalSingle')}
            />
            {inv.memoria.sticks.map((s) => (
              <Row
                key={s.slot}
                label={s.slot}
                value={
                  s.ocupado
                    ? `${s.capacidadeGb} GB · ${s.velocidadeMhz} MHz${s.fabricante ? ` · ${s.fabricante}` : ''}`
                    : t('livre')
                }
              />
            ))}
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => go('memory')}>
                {t('abrirAnalise')} <IconChevron width={12} height={12} />
              </Button>
            </div>
          </Ficha>

          <Ficha id="gpu" num={numOf('gpu')} title={t('sVideo')} selected={sel === 'gpu'} onHot={onHot} register={register}>
            <Row label={t('modelo')} value={inv.gpu.nome} />
            <Row label={t('vram')} value={`${inv.gpu.vramGb} GB`} />
            <Row label={t('driver')} value={inv.gpu.driverVersao} />
            <Row label={t('driverData')} value={inv.gpu.driverData ? fmtDate(inv.gpu.driverData, tag) : null} />
            <Row label={t('resolucao')} value={inv.gpu.resolucaoAtiva} />
            <Row label={t('taxa')} value={`${inv.gpu.taxaHz} Hz`} />
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
                <Row label={t('modelo')} value={d.modelo} />
                <Row label={t('tipo')} value={d.tipo} />
                <Row label={t('capacidade')} value={`${fmtInt(d.capacidadeGb, tag)} GB`} />
                <Row label={t('emUso')} value={`${fmtInt(d.usadoGb, tag)} GB · ${pct}%`} />
                <div className="bg-surface-2 px-[10px] pb-3 pt-1">
                  <ProgressBar pct={pct} showPct={false} />
                </div>
                <Row label={t('temperatura')} value={d.tempC !== null ? `${d.tempC} °C` : null} />
                <Row label={t('particoes')} value={d.particoes.length ? d.particoes.join(' · ') : null} />
                <Row
                  label={t('horasLigadas')}
                  value={d.smart.horasLigadas !== null ? `${fmtInt(d.smart.horasLigadas, tag)} h` : null}
                />
                <Row label={t('ciclos')} value={d.smart.ciclos !== null ? fmtInt(d.smart.ciclos, tag) : null} />
                <Row label={t('tbw')} value={d.smart.tbw !== null ? `${fmtInt(d.smart.tbw, tag)} TB` : null} />
              </Ficha>
            )
          })}

          <Ficha id="network" num={numOf('network')} title={t('sRede')} selected={sel === 'network'} onHot={onHot} register={register}>
            <Row label={t('adaptador')} value={inv.rede.adaptador} />
            <Row
              label={t('linkSpeed')}
              value={inv.rede.velocidadeLinkMbps !== null ? `${fmtInt(inv.rede.velocidadeLinkMbps, tag)} Mb/s` : null}
            />
            <Row label={t('ipv4')} value={inv.rede.ipv4} />
            <Row label={t('gateway')} value={inv.rede.gateway} />
            <Row label={t('mac')} value={inv.rede.mac} />
            <Row label={t('dhcp')} value={inv.rede.dhcp === null ? null : inv.rede.dhcp ? t('sim') : t('nao')} />
          </Ficha>

          <Ficha id="monitors" num={numOf('monitors')} title={t('sMonitores')} selected={sel === 'monitors'} onHot={onHot} register={register}>
            {inv.monitores.length === 0 && <Row label={t('sMonitores')} value={null} />}
            {inv.monitores.map((mon, i) => (
              <Row
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
            <Row label={t('saidaPadrao')} value={inv.audio.saidaPadrao} />
            <Row
              label={t('dispositivos')}
              value={inv.audio.dispositivos.length ? inv.audio.dispositivos.join(' · ') : null}
            />
          </Ficha>

          <Ficha id="power" num={numOf('power')} title={t('sEnergia')} selected={sel === 'power'} onHot={onHot} register={register}>
            <Row label={t('planoAtivo')} value={inv.energia.planoAtivo} />
            <Row
              label={t('bateria')}
              value={bateria ? `${bateria.percentual}%${bateria.carregando ? ` · ${t('emCarga')}` : ''}` : null}
            />
          </Ficha>

          <Ficha id="peripherals" num={numOf('peripherals')} title={t('sPerifericos')} selected={sel === 'peripherals'} onHot={onHot} register={register}>
            <Row label={t('portasUsb')} value={String(inv.perifericos.usbCount)} />
            <Row label={t('mouse')} value={inv.perifericos.mouse} />
            <Row label={t('teclado')} value={inv.perifericos.teclado} />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => go('latency')}>
                {t('abrirLatencia')} <IconChevron width={12} height={12} />
              </Button>
            </div>
          </Ficha>

          <Ficha id="os" num={numOf('os')} title={t('sSistema')} selected={sel === 'os'} onHot={onHot} register={register}>
            <Row label={t('edicao')} value={inv.os.edicao} />
            <Row label={t('build')} value={inv.os.build} />
            <Row label={t('instalacao')} value={fmtDate(inv.os.dataInstalacao, tag)} />
            <Row label={t('uptime')} value={`${fmtInt(inv.os.uptimeHoras, tag)} h`} />
          </Ficha>
        </div>

        <CalloutOverlay container={layoutRef} activeId={active} fichas={fichaRefs} />
      </div>
    </div>
  )
}
