'use client'

import { useEffect, useRef } from 'react'
import { BRAND } from '@/lib/brand'

// Cockpit ilustrativo da landing. Agulhas e telemetria andam com valores de exemplo.
// Nada aqui é lido da máquina do visitante.

const GAUGES: { key: string; label: string; sub: string; base: number }[] = [
  { key: 'cpu', label: 'CPU', sub: 'RYZEN 7 5800X', base: 21 },
  { key: 'gpu', label: 'GPU', sub: 'RTX 3080', base: 37 },
  { key: 'ram', label: 'RAM', sub: '32 GB DDR4', base: 41 },
]

const LEITURAS: [string, string][] = [
  ['SISTEMA', 'WINDOWS 11 PRO 23H2'],
  ['PLANO DE ENERGIA', 'EQUILIBRADO'],
  ['DISCO PRINCIPAL', '610 / 1000 GB'],
  ['MONITOR', '1920×1080 @ 165 HZ'],
  ['FONTE DAS LEITURAS', 'WMI · NVIDIA-SMI'],
]

const ARC = 395.8 // comprimento do arco de 270° com r=84
const SPARK_N = 60

const needleRotate = (v: number) => `rotate(${(-135 + v * 2.7).toFixed(2)} 100 100)`
const arcDash = (v: number) => `${((ARC * v) / 100).toFixed(1)} 999`
const sparkPath = (arr: number[]) =>
  arr
    .map((v, i) => `${i ? 'L' : 'M'}${((i * 600) / (SPARK_N - 1)).toFixed(1)} ${(110 - v * 0.9).toFixed(1)}`)
    .join(' ')

function Gauge({ gkey, label, sub, base }: { gkey: string; label: string; sub: string; base: number }) {
  return (
    <div data-gauge={gkey} className="flex flex-col items-center gap-2.5 bg-carbon px-4 py-5">
      <svg viewBox="0 0 200 138" className="block w-full max-w-[152px]" aria-hidden>
        <path d="M 21.07 128.73 A 84 84 0 1 1 178.93 128.73" fill="none" stroke="#242424" strokeWidth="7" />
        <path d="M 28.58 126 A 76 76 0 1 1 171.42 126" fill="none" stroke="#333333" strokeWidth="6" strokeDasharray="1.2 13.4" />
        <path d="M 176.74 65.84 A 84 84 0 0 1 178.93 128.73" fill="none" stroke="#e5262b" strokeWidth="7" />
        <path
          data-arc
          d="M 21.07 128.73 A 84 84 0 1 1 178.93 128.73"
          fill="none"
          stroke="#f8e800"
          strokeWidth="7"
          strokeDasharray={arcDash(base)}
        />
        <line x1="100" y1="20" x2="100" y2="31" stroke="#6e6e6e" strokeWidth="2" />
        <text x="45.5" y="122.84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#6e6e6e">0</text>
        <text x="100" y="45" textAnchor="middle" fontSize="9" fontWeight="700" fill="#6e6e6e">50</text>
        <text x="154.5" y="122.84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#e5262b">100</text>
        <g data-needle transform={needleRotate(base)}>
          <polygon points="98.4,100 101.6,100 100.6,26 99.4,26" fill="#ffffff" />
          <rect x="97.8" y="100" width="4.4" height="11" fill="rgba(255,255,255,.5)" />
        </g>
        <circle cx="100" cy="100" r="8" fill="#0b0b0b" stroke="rgba(255,255,255,.22)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="2.6" fill="#f8e800" />
      </svg>
      <div className="text-center">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-3">{label}</p>
        <p className="type-num mt-1 text-[2.1rem] font-black leading-none tracking-[-0.03em] text-ink-1">
          <span data-val>{base}</span>
          <span className="text-[15px] font-bold text-ink-3">%</span>
        </p>
        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">{sub}</p>
      </div>
    </div>
  )
}

export function CockpitDemo() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = root.current
    if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const gauges = GAUGES.map((g) => {
      const el = host.querySelector<HTMLElement>(`[data-gauge="${g.key}"]`)!
      return {
        base: g.base,
        cur: g.base,
        target: g.base,
        needle: el.querySelector<SVGGElement>('[data-needle]')!,
        arc: el.querySelector<SVGPathElement>('[data-arc]')!,
        val: el.querySelector<HTMLElement>('[data-val]')!,
      }
    })
    let tick = 0
    const gaugeTimer = setInterval(() => {
      tick += 1
      for (const g of gauges) {
        if (tick % 24 === 0) g.target = Math.max(8, Math.min(88, g.base + (Math.random() - 0.4) * 22))
        g.cur += (g.target - g.cur) * 0.12
        g.needle.setAttribute('transform', needleRotate(g.cur))
        g.arc.setAttribute('stroke-dasharray', arcDash(g.cur))
        g.val.textContent = String(Math.round(g.cur))
      }
    }, 60)

    const series = {
      cpu: Array.from({ length: SPARK_N }, () => 22 + Math.random() * 8),
      gpu: Array.from({ length: SPARK_N }, () => 36 + Math.random() * 8),
    }
    const paths = {
      cpu: host.querySelector<SVGPathElement>('[data-spark="cpu"]')!,
      gpu: host.querySelector<SVGPathElement>('[data-spark="gpu"]')!,
    }
    const step = () => {
      for (const k of ['cpu', 'gpu'] as const) {
        const base = k === 'cpu' ? 24 : 38
        const last = series[k][SPARK_N - 1]
        series[k].push(Math.max(8, Math.min(92, last + (Math.random() - 0.5) * 9 + (base - last) * 0.12)))
        series[k].shift()
        paths[k].setAttribute('d', sparkPath(series[k]))
      }
    }
    step()
    const sparkTimer = setInterval(step, 420)

    return () => {
      clearInterval(gaugeTimer)
      clearInterval(sparkTimer)
    }
  }, [])

  return (
    <div ref={root} className="flex h-full flex-col bg-carbon">
      <div className="sweep border-b border-line">
        <div className="flex min-h-11 items-center gap-2.5 bg-steel px-4 text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink-1">
          COCKPIT
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-b border-line bg-line max-[420px]:grid-cols-1">
        {GAUGES.map((g) => (
          <Gauge key={g.key} gkey={g.key} label={g.label} sub={g.sub} base={g.base} />
        ))}
      </div>

      <div className="px-4 pb-[18px] pt-4">
        <div className="flex items-center justify-between gap-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-3">
          <span>Telemetria — últimos 60 s</span>
          <span className="flex gap-3.5">
            <span className="text-signal">— CPU</span>
            <span>-- GPU</span>
          </span>
        </div>
        <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="mt-3 block h-[124px] w-full" aria-hidden>
          <g stroke="#171717" strokeWidth="1">
            <line x1="0" y1="30" x2="600" y2="30" />
            <line x1="0" y1="60" x2="600" y2="60" />
            <line x1="0" y1="90" x2="600" y2="90" />
          </g>
          <path data-spark="gpu" fill="none" stroke="#5a5a5a" strokeWidth="2" strokeDasharray="5 6" />
          <path data-spark="cpu" fill="none" stroke="#f8e800" strokeWidth="2.4" />
        </svg>
      </div>

      <dl className="grid flex-1 auto-rows-fr gap-px border-t border-line bg-line">
        {LEITURAS.map(([k, v]) => (
          <div key={k} className="flex min-h-[30px] items-center justify-between gap-3 bg-carbon px-4">
            <dt className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-3">{k}</dt>
            <dd className="type-num text-[11.5px] font-bold tracking-[0.06em] text-ink-1">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-steel px-4 py-[11px] text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-3">
        <span className="flex items-center gap-2">
          <span className="led" aria-hidden />
          {BRAND.name}
        </span>
        <span>SISTEMA // PRONTO</span>
      </div>
    </div>
  )
}
