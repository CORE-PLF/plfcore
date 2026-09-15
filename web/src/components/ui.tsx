import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

// Kit base portado do aplicativo. REGRA ZERO: sem canto arredondado, chanfro
// via clip-path, número em mono tabular, barra SEMPRE segmentada.

type ChamferCut = 4 | 6 | 8 | 12

interface ChamferProps extends HTMLAttributes<HTMLDivElement> {
  cut?: ChamferCut
  allCorners?: boolean
  edge?: string
  fill?: string
  flat?: boolean
  brackets?: boolean
}

export function Chamfer({
  cut = 8,
  allCorners = false,
  edge,
  fill,
  flat = false,
  brackets = false,
  className = '',
  style,
  children,
  ...rest
}: ChamferProps) {
  const vars: CSSProperties = {
    ...style,
    '--cut': `${cut}px`,
    ...(edge ? { '--ch-edge': edge } : null),
    ...(fill ? { '--ch-fill': fill } : null),
  } as CSSProperties
  return (
    <div
      className={`chamfer ${allCorners ? 'chamfer--all' : ''} ${flat ? 'chamfer--flat' : ''} ${brackets ? 'brackets' : ''} ${className}`}
      style={vars}
      {...rest}
    >
      {brackets && (
        <>
          <span className="bk" />
          <span className="bk" />
          <span className="bk" />
          <span className="bk" />
        </>
      )}
      {children}
    </div>
  )
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`type-kicker ${className}`}>{children}</p>
}

// Barra segmentada: blocos com gap — nunca barra lisa, nunca spinner infinito.
export function SegProgress({
  value,
  max = 100,
  segments = 24,
  className = '',
  label,
}: {
  value: number
  max?: number
  segments?: number
  className?: string
  label?: string
}) {
  const on = max > 0 ? Math.round((Math.min(value, max) / max) * segments) : 0
  return (
    <div
      className={`segprog ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} className={i < on ? 'on' : ''} />
      ))}
    </div>
  )
}

// Selo obrigatório em qualquer dado ilustrativo/simulado.
export function DemoSeal({ children = 'DEMONSTRAÇÃO' }: { children?: ReactNode }) {
  return <span className="demo-seal">{children}</span>
}

const TAG_COLORS = {
  ok: 'var(--color-ink-1)',
  danger: 'var(--color-signal)',
  warn: 'var(--color-heat)',
  muted: 'var(--color-ink-3)',
} as const

// Estado nunca só por cor: o texto do tag É o estado.
export function StatusTag({
  tone = 'muted',
  children,
}: {
  tone?: keyof typeof TAG_COLORS
  children: ReactNode
}) {
  return (
    <span
      className="type-mono inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] uppercase tracking-widest"
      style={{ color: TAG_COLORS[tone], boxShadow: 'inset 0 0 0 1px var(--color-edge)' }}
    >
      {children}
    </span>
  )
}

export function RuleFade({ className = '' }: { className?: string }) {
  return <div className={`rule-fade ${className}`} />
}

export function Field({
  label,
  name,
  type = 'text',
  required = false,
  placeholder,
  defaultValue,
  autoComplete,
  minLength,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  placeholder?: string
  defaultValue?: string
  autoComplete?: string
  minLength?: number
}) {
  return (
    <div>
      <label htmlFor={name} className="type-kicker mb-1.5 block">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        minLength={minLength}
        className="field"
      />
    </div>
  )
}
