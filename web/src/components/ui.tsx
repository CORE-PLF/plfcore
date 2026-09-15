import type { HTMLAttributes, ReactNode } from 'react'

// Kit base espelhado do app: card com raio 10, botão raio 6, pílula 999,
// número em tabular-nums, barra lisa amarela.

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  flat?: boolean
  edge?: string
}

export function Surface({ flat = false, edge, className = '', style, children, ...rest }: SurfaceProps) {
  return (
    <div
      className={`surface ${flat ? 'surface--flat' : ''} ${className}`}
      style={edge ? { ...style, borderColor: edge } : style}
      {...rest}
    >
      {children}
    </div>
  )
}

export function SurfaceHead({
  children,
  aside,
  className = '',
}: {
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={`surface-head ${className}`}>
      <span>{children}</span>
      {aside && <span className="ml-auto type-num text-[10px] tracking-[0.18em] text-ink-3">{aside}</span>}
    </div>
  )
}

// ponytail: admin/afiliado/revenda (fora do redesign) ainda passam props de chanfro; hoje é só um Surface.
interface ChamferProps extends SurfaceProps {
  cut?: number
  allCorners?: boolean
  fill?: string
  brackets?: boolean
}
export function Chamfer({ cut: _cut, allCorners: _all, fill: _fill, brackets: _b, ...rest }: ChamferProps) {
  return <Surface {...rest} />
}

export function Kicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`type-kicker ${className}`}>{children}</p>
}

export function ProgressBar({
  value,
  max = 100,
  className = '',
  label,
  hot = false,
}: {
  value: number
  max?: number
  className?: string
  label?: string
  hot?: boolean
}) {
  const pct = max > 0 ? Math.min(100, Math.round((Math.min(value, max) / max) * 100)) : 0
  return (
    <div
      className={`progress ${hot ? 'progress--hot' : ''} ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}
export const SegProgress = ProgressBar

// Selo obrigatório em qualquer dado ilustrativo/simulado.
export function DemoSeal({ children = 'DEMONSTRAÇÃO' }: { children?: ReactNode }) {
  return <span className="demo-seal">{children}</span>
}

// Estado nunca só por cor: o texto da pílula É o estado.
export function StatusTag({
  tone = 'muted',
  children,
}: {
  tone?: 'ok' | 'danger' | 'warn' | 'muted'
  children: ReactNode
}) {
  return <span className={`pill ${tone === 'muted' ? '' : `pill--${tone}`}`}>{children}</span>
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

// Aviso inline: ícone + texto, nunca só cor.
export function Notice({
  tone = 'warn',
  title,
  children,
  className = '',
  role,
}: {
  tone?: 'warn' | 'danger' | 'ok'
  title?: string
  children: ReactNode
  className?: string
  role?: string
}) {
  const color =
    tone === 'danger' ? 'var(--color-blood)' : tone === 'ok' ? 'var(--color-ink-1)' : 'var(--color-signal)'
  const icon = tone === 'ok' ? '✓' : '!'
  return (
    <Surface flat edge={tone === 'ok' ? undefined : color} className={`px-4 py-3 ${className}`} role={role}>
      <div className="flex gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={{ color, border: `1px solid ${color}` }}
        >
          {icon}
        </span>
        <div className="min-w-0 text-sm text-ink-2">
          {title && (
            <p className="type-kicker mb-1" style={{ color }}>
              {title}
            </p>
          )}
          {children}
        </div>
      </div>
    </Surface>
  )
}
