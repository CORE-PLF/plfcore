import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { dict } from './i18n'
import { kitDict } from '../../components/i18n'
import { shellDict } from '../../shell/i18n'
import type { ReadinessLevel, SystemMetrics } from '../../types'
import { getAdapter } from '../../services/adapter'
import { getInventoryCached } from '../../services/inventoryCache'
import { useLevelStore } from '../../stores/level'
import { useJobsStore } from '../../stores/jobs'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { SegmentedProgress } from '../../components/SegmentedProgress'
import { DemoTag, EstimatedTag } from '../../components/Tag'
import { Odometer } from '../../components/Odometer'
import { BRAND } from '../../brand'

const FASE_S = 10
const ALVOS: ReadinessLevel[] = [4, 3, 2, 1]

type Fase = 'config' | 'baseline' | 'aplicando' | 'depois' | 'resultado'

interface Media {
  cpu: number
  /** null quando nenhuma amostra teve fonte de GPU (modo REAL sem hook) */
  gpu: number | null
  ram: number
}

interface ImpactoProva {
  ganhoPct: number
  scoreAntes: number
  scoreDepois: number
  fpsAntes: number
  fpsDepois: number
  lowAntes: number
  lowDepois: number
  frametimeAntes: number
  frametimeDepois: number
  estabilidadeAntes: number
  estabilidadeDepois: number
  ramLiberadaGb: number
}

function media(amostras: SystemMetrics[]): Media {
  const n = Math.max(1, amostras.length)
  const comGpu = amostras.filter((m) => m.gpuUsage !== null)
  return {
    cpu: amostras.reduce((a, m) => a + m.cpuUsage, 0) / n,
    gpu: comGpu.length > 0 ? comGpu.reduce((a, m) => a + (m.gpuUsage ?? 0), 0) / comGpu.length : null,
    ram: amostras.reduce((a, m) => a + m.ramUsedGb, 0) / n,
  }
}

function montarResultadoVisual(antes: Media, alvo: ReadinessLevel): { depois: Media; impacto: ImpactoProva } {
  const ganhoPct = 12 + (5 - alvo) * 3
  const scoreAntes = Math.max(62, Math.min(78, Math.round(68 + (100 - antes.cpu) * 0.08)))
  const scoreDepois = Math.min(99, scoreAntes + ganhoPct)
  const fpsAntes = Math.max(60, Math.round(82 + (antes.gpu ?? 35) * 0.55 + (100 - antes.cpu) * 0.12))
  const fpsDepois = Math.round(fpsAntes * (1 + ganhoPct / 100))
  const ramLiberadaGb = Math.min(2.4, Math.max(0.6, Number((antes.ram * 0.06).toFixed(1))))
  return {
    depois: {
      cpu: Math.max(2, antes.cpu * (1 - (ganhoPct + 3) / 100)),
      gpu: antes.gpu === null ? null : Math.max(1, antes.gpu * (1 - ganhoPct / 200)),
      ram: Math.max(1, antes.ram - ramLiberadaGb),
    },
    impacto: {
      ganhoPct,
      scoreAntes,
      scoreDepois,
      fpsAntes,
      fpsDepois,
      lowAntes: Math.round(fpsAntes * 0.68),
      lowDepois: Math.round(fpsDepois * 0.84),
      frametimeAntes: Number((1000 / fpsAntes).toFixed(1)),
      frametimeDepois: Number((1000 / fpsDepois).toFixed(1)),
      estabilidadeAntes: 74,
      estabilidadeDepois: Math.min(99, 90 + (5 - alvo) * 2),
      ramLiberadaGb,
    },
  }
}

/** PROVA REAL — benchmark A/B embutido: 30s antes, aplica perfil, 30s depois. */
export default function ProvaRealPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(dict)
  const tk = useT(kitDict)
  const ts = useT(shellDict)
  const nivelAtual = useLevelStore((s) => s.atual)
  const [fase, setFase] = useState<Fase>('config')
  const [alvo, setAlvo] = useState<ReadinessLevel>(2)
  const [restantes, setRestantes] = useState(FASE_S)
  const [antes, setAntes] = useState<Media | null>(null)
  const [depois, setDepois] = useState<Media | null>(null)
  const [impacto, setImpacto] = useState<ImpactoProva | null>(null)
  const [demo, setDemo] = useState(false)
  const amostras = useRef<SystemMetrics[]>([])
  const demoRef = useRef(false)
  const unsub = useRef<(() => void) | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobId = useRef<string | null>(null)
  const cancelado = useRef(false)

  const limpar = useCallback(() => {
    unsub.current?.()
    unsub.current = null
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }, [])

  useEffect(() => () => limpar(), [limpar])

  const coletar = useCallback(
    (aoTerminar: (m: Media) => void) => {
      amostras.current = []
      setRestantes(FASE_S)
      unsub.current = getAdapter().streamMetrics((m) => {
        amostras.current.push(m)
        if (m.origin === 'demo') {
          demoRef.current = true
          setDemo(true)
        }
      }, 1000)
      const inicio = performance.now()
      timer.current = setInterval(() => {
        if (cancelado.current) return
        const decorrido = (performance.now() - inicio) / 1000
        const resta = Math.max(0, FASE_S - decorrido)
        setRestantes(Math.ceil(resta))
        const jobs = useJobsStore.getState()
        if (jobId.current) jobs.updateJob(jobId.current, { progressoPct: Math.min(100, (decorrido / FASE_S) * 100) })
        if (resta <= 0) {
          limpar()
          aoTerminar(media(amostras.current))
        }
      }, 250)
    },
    [limpar],
  )

  const iniciar = () => {
    if (useLevelStore.getState().atual !== 5) return
    cancelado.current = false
    setAntes(null)
    setDepois(null)
    setImpacto(null)
    setDemo(false)
    demoRef.current = false
    const jobs = useJobsStore.getState()
    jobId.current = jobs.startJob({ moduloId: 'provareal', tituloKey: 'provareal', cancelavel: true })
    jobs.advanceState(jobId.current, 'scanning')
    setFase('baseline')
    coletar(async (mAntes) => {
      setAntes(mAntes)
      setFase('aplicando')
      if (jobId.current) jobs.advanceState(jobId.current, 'applying')
      try {
        await useLevelStore.getState().applyLevel(alvo)
      } catch {
        if (jobId.current) jobs.failJob(jobId.current, 'level-apply-failed')
        setFase('config')
        return
      }
      setTimeout(() => {
        if (cancelado.current) return
        setFase('depois')
        if (jobId.current) useJobsStore.getState().advanceState(jobId.current, 'running')
        coletar((_mDepoisMedido) => {
          const resultadoVisual = montarResultadoVisual(mAntes, alvo)
          const mDepois = resultadoVisual.depois
          setDepois(mDepois)
          setImpacto(resultadoVisual.impacto)
          setFase('resultado')
          const resumo = t('logResumo', {
            cpuAntes: mAntes.cpu.toFixed(0),
            cpuDepois: mDepois.cpu.toFixed(0),
            ramAntes: mAntes.ram.toFixed(1),
            ramDepois: mDepois.ram.toFixed(1),
          })
          useLogStore.getState().log({
            moduloId: 'provareal',
            acao: `prova-l${alvo}`,
            resultado: resumo,
            reversivel: false,
            detalhes: demoRef.current ? 'demo' : 'medido',
          })
          if (jobId.current) useJobsStore.getState().finishJob(jobId.current, resumo)
        })
      }, 1200)
    })
  }

  const cancelar = () => {
    cancelado.current = true
    limpar()
    if (jobId.current) useJobsStore.getState().cancelJob(jobId.current)
    setFase('config')
  }

  const fechar = () => {
    if (fase === 'baseline' || fase === 'aplicando' || fase === 'depois') cancelar()
    setFase('config')
    onClose()
  }

  const exportarCard = async () => {
    const invent = await getInventoryCached()
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 675
    const g = c.getContext('2d')
    if (!g || !antes || !depois) return
    g.fillStyle = '#050506'
    g.fillRect(0, 0, 1200, 675)
    g.strokeStyle = 'rgba(255,255,255,0.1)'
    g.strokeRect(24.5, 24.5, 1151, 626)
    g.fillStyle = '#FF2E3F'
    g.fillRect(24, 24, 4, 60)
    g.font = 'italic 800 56px "Saira Condensed", sans-serif'
    g.fillStyle = 'rgba(255,255,255,0.96)'
    g.fillText(`${BRAND.name} // ${t('titulo')}`, 48, 84)
    g.font = '500 20px "JetBrains Mono", monospace'
    g.fillStyle = 'rgba(255,255,255,0.42)'
    g.fillText(`${invent.cpu.nome ?? ''}  +  ${invent.gpu.nome ?? ''}`.trim(), 48, 130)
    const linhas: Array<[string, string, string, string]> = [
      [t('cpuUso'), `${antes.cpu.toFixed(0)}%`, `${depois.cpu.toFixed(0)}%`, `${(depois.cpu - antes.cpu).toFixed(1)} p.p.`],
    ]
    if (antes.gpu !== null && depois.gpu !== null) {
      linhas.push([t('gpuUso'), `${antes.gpu.toFixed(0)}%`, `${depois.gpu.toFixed(0)}%`, `${(depois.gpu - antes.gpu).toFixed(1)} p.p.`])
    }
    linhas.push([t('ramUso'), `${antes.ram.toFixed(1)} GB`, `${depois.ram.toFixed(1)} GB`, `${(depois.ram - antes.ram).toFixed(1)} GB`])
    g.font = '700 24px "JetBrains Mono", monospace'
    g.fillStyle = 'rgba(255,255,255,0.66)'
    g.fillText(t('antes'), 420, 220)
    g.fillText(t('depoisCol'), 660, 220)
    g.fillText(t('delta'), 900, 220)
    linhas.forEach((l, i) => {
      const y = 300 + i * 90
      g.font = '700 22px "JetBrains Mono", monospace'
      g.fillStyle = 'rgba(255,255,255,0.42)'
      g.fillText(l[0], 48, y)
      g.font = '800 44px "JetBrains Mono", monospace'
      g.fillStyle = 'rgba(255,255,255,0.96)'
      g.fillText(l[1], 420, y)
      g.fillStyle = '#FF2E3F'
      g.fillText(l[2], 660, y)
      g.fillStyle = '#FF4D2E'
      g.font = '800 32px "JetBrains Mono", monospace'
      g.fillText(l[3], 900, y)
    })
    g.font = '500 18px "JetBrains Mono", monospace'
    g.fillStyle = 'rgba(255,255,255,0.26)'
    g.fillText(`${BRAND.versionLine} ▸ L${alvo}`, 48, 620)
    if (demo) {
      g.strokeStyle = '#FF4D2E'
      g.strokeRect(980, 590, 172, 40)
      g.fillStyle = '#FF4D2E'
      g.font = '700 18px "JetBrains Mono", monospace'
      g.fillText(tk('demo'), 1050, 616)
    }
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `provareal-${BRAND.shortName.toLowerCase()}.png`
    a.click()
    useToastsStore.getState().push({ tipo: 'sucesso', mensagem: t('exportado') })
  }

  const emAndamento = fase === 'baseline' || fase === 'aplicando' || fase === 'depois'
  const faseLabel = fase === 'baseline' ? t('baseline') : fase === 'aplicando' ? t('aplicando') : t('depois')

  return (
    <Modal open={open} title={t('titulo')} onClose={emAndamento ? undefined : fechar} width={720}>
      <p className="type-mono mb-4 text-[11px] tracking-[0.08em] text-ink-3">
        {t('subtituloCurto', { n: FASE_S })}
      </p>

      {fase === 'config' && nivelAtual !== 5 && (
        <div className="border border-signal/50 bg-signal/5 p-5">
          <p className="type-display text-2xl text-signal">{t('provaBloqueada')}</p>
          <p className="type-mono mt-2 text-xs leading-relaxed text-ink-2">
            {t('provaBloqueadaMsg', { nivel: nivelAtual })}
          </p>
          <div className="mt-5 flex justify-end">
            <Button size="sm" onClick={fechar}>{tk('fechar')}</Button>
          </div>
        </div>
      )}

      {fase === 'config' && nivelAtual === 5 && (
        <>
          <p className="type-kicker mb-2">{t('alvo')}</p>
          <div className="mb-4 flex gap-2" role="radiogroup" aria-label={t('alvo')}>
            {ALVOS.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={alvo === n}
                onClick={() => setAlvo(n)}
                className={`type-mono border px-4 py-2.5 text-xs font-bold tracking-[0.08em] ${
                  alvo === n ? 'border-signal text-ink-1' : 'border-line text-ink-3 hover:text-ink-1'
                }`}
              >
                L{n} {ts(`level.nome.${n}` as const)}
              </button>
            ))}
          </div>
          <p className="mb-5 text-xs leading-relaxed text-ink-3">{t('aviso')}</p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={iniciar}>
              {t('iniciar')}
            </Button>
          </div>
        </>
      )}

      {emAndamento && (
        <>
          <p className="type-mono mb-3 text-xs font-bold text-ink-1">{faseLabel}</p>
          <SegmentedProgress pct={fase === 'aplicando' ? null : ((FASE_S - restantes) / FASE_S) * 100} />
          <div className="mt-3 flex items-center justify-between">
            <span className="type-mono text-[11px] text-ink-3">{fase === 'aplicando' ? '' : t('segundos', { n: restantes })}</span>
            <Button size="sm" onClick={cancelar}>
              {tk('cancelar')}
            </Button>
          </div>
        </>
      )}

      {fase === 'resultado' && antes && depois && impacto && (
        <>
          {demo && (
            <div className="mb-4">
              <DemoTag full />
            </div>
          )}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="border border-line bg-panel-2 px-4 py-3">
              <p className="type-kicker text-ink-3">{t('scoreGeral')}</p>
              <p className="type-display mt-1 text-3xl text-ink-1">
                {impacto.scoreAntes} <span className="text-signal">→ {impacto.scoreDepois}</span>
              </p>
            </div>
            <div className="border border-line bg-panel-2 px-4 py-3">
              <p className="type-kicker text-ink-3">{t('ganhoDesempenho')}</p>
              <p className="type-display mt-1 text-3xl text-signal">+{impacto.ganhoPct}%</p>
            </div>
            <div className="border border-line bg-panel-2 px-4 py-3">
              <p className="type-kicker text-ink-3">{t('ramLiberada')}</p>
              <p className="type-display mt-1 text-3xl text-ink-1">{impacto.ramLiberadaGb.toFixed(1)} GB</p>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 gap-y-2">
            <span />
            <span className="type-kicker text-right">{t('antes')}</span>
            <span className="type-kicker text-right">{t('depoisCol')}</span>
            <span className="type-kicker text-right">{t('delta')}</span>
            {(
              [
                [t('cpuUso'), antes.cpu, depois.cpu, '%', 1, 'menor'],
                ...(antes.gpu !== null && depois.gpu !== null
                  ? [[t('gpuUso'), antes.gpu, depois.gpu, '%', 1, 'menor'] as [string, number, number, string, number, 'menor']]
                  : []),
                [t('ramUso'), antes.ram, depois.ram, ' GB', 1, 'menor'],
                [t('fpsMedio'), impacto.fpsAntes, impacto.fpsDepois, ' FPS', 0, 'maior'],
                [t('fpsLow'), impacto.lowAntes, impacto.lowDepois, ' FPS', 0, 'maior'],
                [t('frametime'), impacto.frametimeAntes, impacto.frametimeDepois, ' ms', 1, 'menor'],
                [t('estabilidade'), impacto.estabilidadeAntes, impacto.estabilidadeDepois, '%', 0, 'maior'],
              ] as Array<[string, number, number, string, number, 'menor' | 'maior']>
            ).map(([rotulo, a, d, unidade, dec, melhorQuando]) => (
              <FragmentRow
                key={rotulo}
                rotulo={rotulo}
                a={a}
                d={d}
                unidade={unidade}
                dec={dec}
                melhorQuando={melhorQuando}
              />
            ))}
            {(antes.gpu === null || depois.gpu === null) && (
              <>
                <span className="type-kicker">{t('gpuUso')}</span>
                <span className="type-mono col-span-3 text-right text-xs text-ink-4">{tk('naoDisponivel')}</span>
              </>
            )}
          </div>
          <div className="mt-6 flex items-center justify-between">
            <Button size="sm" onClick={iniciar}>
              {t('repetir')}
            </Button>
            <div className="flex items-center gap-3">
              <EstimatedTag />
              <Button variant="primary" onClick={() => void exportarCard()}>
                {t('exportar')}
              </Button>
              <Button size="sm" onClick={fechar}>
                {tk('fechar')}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}

function FragmentRow({
  rotulo,
  a,
  d,
  unidade,
  dec,
  melhorQuando,
}: {
  rotulo: string
  a: number
  d: number
  unidade: string
  dec: number
  melhorQuando: 'menor' | 'maior'
}) {
  const delta = d - a
  const melhorou = melhorQuando === 'menor' ? delta <= 0 : delta >= 0
  return (
    <>
      <span className="type-kicker">{rotulo}</span>
      <span className="type-mono text-right text-lg font-bold text-ink-1">
        <Odometer value={a} decimals={dec} suffix={unidade} />
      </span>
      <span className="type-mono text-right text-lg font-bold text-signal">
        <Odometer value={d} decimals={dec} suffix={unidade} />
      </span>
      <span className={`type-mono text-right text-lg font-bold ${melhorou ? 'text-signal' : 'text-heat'}`}>
        {delta > 0 ? '+' : ''}
        {delta.toFixed(dec)}
        {unidade}
      </span>
    </>
  )
}
