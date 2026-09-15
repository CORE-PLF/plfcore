import { useId } from 'react'
import './kit.css'

// Conta-giros: varredura de 220°, zona vermelha no fim da trilha.
const SWEEP = 220
const START = -110
const R = 84
const CX = 100
const CY = 100

function polar(angleDeg: number, r: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function arc(fromDeg: number, toDeg: number, r: number): string {
  const [x1, y1] = polar(fromDeg, r)
  const [x2, y2] = polar(toDeg, r)
  const large = toDeg - fromDeg > 180 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const angleOf = (pct: number) => START + (SWEEP * Math.max(0, Math.min(100, pct))) / 100

interface Props {
  /** 0..100; null = sem fonte confiável (sem agulha, nunca inventa) */
  value: number | null
  label: string
  /** início da zona vermelha em % (default 80) */
  redFrom?: number
  unit?: string
  sublabel?: string | null
  /** pico dos últimos 60s — marcador fino na trilha */
  peak?: number | null
  onClick?: () => void
  size?: number
  /** ocupa 100% da largura do container */
  fluid?: boolean
  /** legenda abaixo do mostrador (o card do cockpit já tem cabeçalho) */
  showLabel?: boolean
}

/** Mostrador: trilha cinza, percorrido amarelo, zona de perigo vermelha, agulha branca. Valor fica fora (no card). */
export function Gauge({ value, label, redFrom = 80, unit = '%', sublabel, peak, onClick, size = 186, fluid = false, showLabel = true }: Props) {
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value))
  const angle = angleOf(clamped)
  const redStart = angleOf(redFrom)
  const inRed = value !== null && clamped >= redFrom
  const id = useId()
  const majors = [0, 25, 50, 75, 100]

  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className="group relative block bg-transparent text-left"
      onClick={onClick}
      style={{ width: fluid ? '100%' : size, cursor: onClick ? 'pointer' : undefined, border: 'none', padding: 0 }}
      aria-label={onClick ? label : undefined}
    >
      <svg viewBox="0 0 200 138" width={fluid ? '100%' : size} role="img" aria-labelledby={id} style={{ display: 'block' }}>
        <title id={id}>{value === null ? label : `${label} ${clamped.toFixed(0)}${unit}`}</title>

        <path d={arc(START, START + SWEEP, R)} stroke="#2a2a2a" strokeWidth="7" fill="none" />
        <path d={arc(START, START + SWEEP, R - 8)} stroke="#3d3d3d" strokeWidth="6" strokeDasharray="1.2 13.4" fill="none" />
        <path d={arc(redStart, START + SWEEP, R)} stroke="var(--color-blood)" strokeWidth="7" fill="none" />

        {value !== null && clamped > 0.5 && (
          <path d={arc(START, angle, R)} stroke={inRed ? 'var(--color-blood)' : 'var(--color-signal)'} strokeWidth="7" fill="none" />
        )}

        {majors.map((p) => {
          const a = angleOf(p)
          const [x1, y1] = polar(a, R - 4)
          const [x2, y2] = polar(a, R - 15)
          const [tx, ty] = polar(a, R - 26)
          const red = p >= redFrom
          return (
            <g key={p}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={red ? 'var(--color-blood)' : '#7a7a7a'} strokeWidth="2" />
              <text x={tx} y={ty + 3} textAnchor="middle" fontSize="9" fontFamily="var(--font-ui)" fontWeight="700" fill={red ? 'var(--color-blood)' : '#7d7d7d'}>
                {p}
              </text>
            </g>
          )
        })}

        {peak != null && value !== null && (
          <g>
            {(() => {
              const a = angleOf(peak)
              const [x1, y1] = polar(a, R + 5)
              const [x2, y2] = polar(a, R + 10)
              return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-signal)" strokeWidth="2" />
            })()}
          </g>
        )}

        {value !== null && (
          <g className="gauge-needle" style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 100px' }}>
            <polygon points="98.4,100 101.6,100 100.6,26 99.4,26" fill="#ffffff" />
            <rect x="97.8" y="100" width="4.4" height="11" fill="rgba(255,255,255,.5)" />
          </g>
        )}

        <circle cx={CX} cy={CY} r="8" fill="var(--color-steel)" stroke="rgba(255,255,255,.26)" strokeWidth="1.5" />
        <circle cx={CX} cy={CY} r="2.6" fill={inRed ? 'var(--color-blood)' : 'var(--color-signal)'} />
      </svg>
      {showLabel && (
        <div className="mt-1 text-center">
          <div className="type-kicker">{label}</div>
          {sublabel && <div className="type-num mt-0.5 truncate px-2 text-[10px] text-ink-3">{sublabel}</div>}
        </div>
      )}
    </Tag>
  )
}
