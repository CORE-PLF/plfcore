import { useCallback, useEffect, useRef } from 'react'
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
 * Ação destrutiva: segurar 900ms. Uma carga preenche o botão da esquerda
 * pra direita; soltar antes cancela e a carga recua.
 */
export function HoldButton({ onConfirm, armed = true, variant = 'danger', className = '', children, disabled, ...rest }: Props) {
  const chargeRef = useRef<HTMLSpanElement>(null)
  const raf = useRef(0)
  const start = useRef(0)
  const progress = useRef(0)
  const holding = useRef(false)
  const fired = useRef(false)

  const paint = useCallback(() => {
    const el = chargeRef.current
    if (el) el.style.width = `${progress.current * 100}%`
  }, [])

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
        progress.current = Math.max(0, progress.current - 3 / (HOLD_MS / 16.7))
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
      className={`btn holdbtn btn--${variant} ${className}`}
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
      <span ref={chargeRef} className="charge" aria-hidden />
      <span className="label inline-flex items-center gap-2">{children}</span>
    </button>
  )
}
