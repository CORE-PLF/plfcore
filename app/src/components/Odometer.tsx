import { useEffect, useRef, useState } from 'react'

const SCRAMBLE = '0123456789'

interface Props {
  value: number
  decimals?: number
  /** anima só na primeira renderização; depois transição direta */
  durationMs?: number
  suffix?: string
  className?: string
}

/** Número tabular com scramble de odômetro na entrada. */
export function Odometer({ value, decimals = 0, durationMs = 400, suffix = '', className = '' }: Props) {
  const [text, setText] = useState('')
  const done = useRef(false)
  const raf = useRef(0)

  useEffect(() => {
    const target = value.toFixed(decimals)
    if (done.current) {
      setText(target)
      return
    }
    const t0 = performance.now()
    const step = (ts: number) => {
      const p = Math.min(1, (ts - t0) / durationMs)
      setText(
        target
          .split('')
          .map((ch, i) =>
            /\d/.test(ch) && p < (i + 1) / (target.length + 1)
              ? SCRAMBLE[Math.floor(((ts / 30) * (i + 3)) % 10)]!
              : ch,
          )
          .join(''),
      )
      if (p < 1) raf.current = requestAnimationFrame(step)
      else done.current = true
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, decimals, durationMs])

  return (
    <span className={`type-num ${className}`}>
      {text || value.toFixed(decimals)}
      {suffix}
    </span>
  )
}
