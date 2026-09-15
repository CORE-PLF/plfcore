import './kit.css'

/** Linha de varredura vermelha em loop — overlay de análise. */
export function ScanLine({ durationS = 1.2, active = true }: { durationS?: number; active?: boolean }) {
  if (!active) return null
  return <div className="scanline" style={{ '--scan-t': `${durationS}s` } as React.CSSProperties} aria-hidden />
}
