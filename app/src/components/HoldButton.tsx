import { useCallback, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { sfx } from '../services/sfx'
import './kit.css'

const HOLD_MS = 900

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  onConfirm: () => void
  /** trava de armamento: desabilitado enquanto não armado */
  armed?: boolean
  variant?: 'primary' | 'danger'
}

/**
 * Ação destrutiva: segurar 900ms. Uma borda de carga percorre o perímetro
 * do chanfro; soltar antes cancela e a carga recua.
 */
export function HoldButton({ onConfirm, armed = true, variant = 'danger', className = '', children, disabled, ...rest }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const [perimeter, setPerimeter] = useState(0)
  const raf = useRef(0)
  const start = useRef(0)
  const progress = useRef(0)
  const holding = useRef(false)
  const fired = useRef(false)

  // path do perímetro acompanha o chanfro real do botão
  useEffect(() => {
    const el = btnRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const { offsetWidth: w, offsetHeight: h } = el
      const c = 6
      const d = `M ${c} 0 H ${w} V ${h - c} L ${w - c} ${h} H 0 V ${c} Z`
      pathRef.current?.setAttribute('d', d)
      setPerimeter(2 * (w + h) - 4 * c + 2 * c * Math.SQRT2)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const paint = useCallback(() => {
    const p = pathRef.current
    if (p) p.style.strokeDashoffset = String(perimeter * (1 - progress.current))
  }, [perimeter])

  const loop = useCallback(
    (ts: number) => {
      if (holding.current) {
        progress.current = Math.min(1, (ts - start.current) / HOLD_MS)
        paint()
        if (progress.current >= 1 && !fired.current) {
          fired.current = true
          holding.current = false
          sfx.chargeEnd(true)
          onConfirm()
          progress.current = 0
          paint()
          return
        }
      } else {
        // carga recua 3× mais rápido
        progress.current = Math.max(0, progress.current - 3 / (HOLD_MS / 16.7) )
        paint()
        if (progress.current <= 0) return
      }
      raf.current = requestAnimationFrame(loop)
    },
    [onConfirm, paint],
  )

  const begin = useCallback(() => {
    if (disabled || !armed || fired.current) return
    holding.current = true
    start.current = performance.now() - progress.current * HOLD_MS
    sfx.chargeStart(HOLD_MS * (1 - progress.current))
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(loop)
  }, [armed, disabled, loop])

  const end = useCallback(() => {
    if (!holding.current) return
    holding.current = false
    sfx.chargeEnd(false)
  }, [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useEffect(() => {
    fired.current = false
  }, [children])

  return (
    <button
      ref={btnRef}
      className={`btn chamfer holdbtn btn--${variant} ${className}`}
      style={{ '--cut': '6px' } as React.CSSProperties}
      disabled={disabled || !armed}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={end}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) begin()
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') end()
      }}
      {...rest}
    >
      {children}
      <svg className="charge" aria-hidden>
        <path
          ref={pathRef}
          style={{ strokeDasharray: perimeter, strokeDashoffset: perimeter }}
        />
      </svg>
    </button>
  )
}
