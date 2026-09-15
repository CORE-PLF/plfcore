import { useId } from 'react'
import { Odometer } from './Odometer'
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
  /** 0..100; null = sem fonte confiável (mostra N/D, nunca inventa) */
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
  /** ocupa 100% da largura do container (instrument housing) */
  fluid?: boolean
}

export function Gauge({ value, label, redFrom = 80, unit = '%', sublabel, peak, onClick, size = 200, fluid = false }: Props) {
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value))
  const angle = angleOf(clamped)
  const redStart = angleOf(redFrom)
  const inRed = value !== null && clamped >= redFrom
  const id = useId()

  // ticks menores a cada 5%, maiores a cada 25% (com escala numérica)
  const minors = Array.from({ length: 21 }, (_, i) => i * 5).filter((p) => p % 25 !== 0)
  const majors = [0, 25, 50, 75, 100]

  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className="group relative block bg-transparent text-left"
      onClick={onClick}
      style={{ width: fluid ? '100%' : size, cursor: onClick ? 'pointer' : undefined, border: 'none', padding: 0 }}
      aria-label={onClick ? label : undefined}
    >
      <svg viewBox="0 0 200 148" width={fluid ? '100%' : size} role="img" aria-labelledby={id}>
        <title id={id}>{value === null ? label : `${label} ${clamped.toFixed(0)}${unit}`}</title>

        {/* mostrador: fundo + aro externo */}
        <path d={arc(START, START + SWEEP, R + 9)} stroke="rgba(255,255,255,.05)" strokeWidth="1" fill="none" />
        <path d={arc(START, START + SWEEP, R)} stroke="rgba(255,255,255,.10)" strokeWidth="7" fill="none" />
        <path d={arc(START, START + SWEEP, R - 5)} stroke="rgba(255,255,255,.05)" strokeWidth="1" fill="none" />

        {/* trilha percorrida acesa até a agulha */}
        {value !== null && clamped > 0.5 && (
          <path
            d={arc(START, angle, R)}
            stroke={inRed ? 'var(--color-signal)' : 'var(--color-heat)'}
            strokeWidth="3"
            fill="none"
            opacity=".8"
          />
        )}

        {/* zona vermelha marcada */}
        <path d={arc(redStart, START + SWEEP, R)} stroke="var(--color-rust)" strokeWidth="7" fill="none" />
        <path d={arc(redStart, START + SWEEP, R + 5)} stroke="var(--color-signal)" strokeWidth="1.5" fill="none" opacity=".8" />

        {/* ticks menores */}
        {minors.map((p) => {
          const a = angleOf(p)
          const [x1, y1] = polar(a, R - 5)
          const [x2, y2] = polar(a, R - 11)
          return <line key={p} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,.16)" strokeWidth="1" />
        })}
        {/* ticks maiores + escala numérica */}
        {majors.map((p) => {
          const a = angleOf(p)
          const [x1, y1] = polar(a, R - 4)
          const [x2, y2] = polar(a, R - 15)
          const [tx, ty] = polar(a, R - 26)
          return (
            <g key={p}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={p >= redFrom ? 'var(--color-signal)' : 'rgba(255,255,255,.45)'} strokeWidth="2" />
              <text
                x={tx}
                y={ty + 3}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fontWeight="700"
                fill={p >= redFrom ? 'var(--color-signal)' : 'rgba(255,255,255,.3)'}
              >
                {p}
              </text>
            </g>
          )
        })}

        {/* pico dos últimos 60s */}
        {peak != null && value !== null && (
          <g opacity=".9">
            {(() => {
              const a = angleOf(peak)
              const [x1, y1] = polar(a, R + 2)
              const [x2, y2] = polar(a, R + 8)
              return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-heat)" strokeWidth="2" />
            })()}
          </g>
        )}

        {/* agulha cônica com contrapeso e inércia; sem fonte → sem agulha */}
        {value !== null && (
          <g
            className={`gauge-needle ${inRed ? 'redzone' : ''}`}
            style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 100px' }}
          >
            <polygon
              points="98.4,100 101.6,100 100.6,26 99.4,26"
              fill={inRed ? 'var(--color-signal)' : 'var(--color-ink-1)'}
            />
            <rect x="97.8" y="100" width="4.4" height="11" fill={inRed ? 'var(--color-signal)' : 'rgba(255,255,255,.55)'} />
          </g>
        )}

        {/* cubo central com LED de estado */}
        <circle cx="100" cy="100" r="8" fill="var(--color-steel)" stroke="rgba(255,255,255,.28)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="2.6" fill={inRed ? 'var(--color-signal)' : 'rgba(255,255,255,.22)'} filter={inRed ? 'var(--glow-signal)' : undefined} />

        {/* janela do valor, estilo odômetro, abaixo do cubo — o texto escala junto com o mostrador */}
        <rect x="66" y="118" width="68" height="26" fill="rgba(5,5,6,.9)" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
        <line x1="66" y1="118" x2="74" y2="118" stroke="var(--color-signal)" strokeWidth="2" />
        <foreignObject x="66" y="118" width="68" height="26" pointerEvents="none">
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              className="type-mono"
              style={{
                fontSize: 15,
                fontWeight: 700,
                lineHeight: 1,
                color: value === null ? 'var(--color-ink-4)' : 'var(--color-ink-1)',
              }}
            >
              {value === null ? 'N/D' : <Odometer value={clamped} suffix={unit} />}
            </span>
          </div>
        </foreignObject>
      </svg>
      <div className="mt-1 text-center">
        <div className="type-kicker">{label}</div>
        {sublabel && <div className="type-mono mt-0.5 truncate px-2 text-[10px] text-ink-4">{sublabel}</div>}
      </div>
    </Tag>
  )
}
