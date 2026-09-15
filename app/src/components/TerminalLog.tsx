import { useEffect, useRef } from 'react'

/** Log denso em mono com auto-scroll e scanlines. */
export function TerminalLog({ lines, className = '' }: { lines: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [lines.length])
  return (
    <div ref={ref} className={`scanlines overflow-y-auto bg-carbon p-3 ${className}`}>
      {lines.map((l, i) => (
        <p key={i} className="type-mono whitespace-pre-wrap py-px text-[11px] leading-relaxed text-ink-2">
          {l}
        </p>
      ))}
    </div>
  )
}
