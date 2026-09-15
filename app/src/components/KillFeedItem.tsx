import { IconCheck } from './icons'
import './kit.css'

interface Props {
  alvo: string
  acaoLabel: string
  quantidade: string | null
  leaving?: boolean
  onClick?: () => void
}

/** Entrada do kill feed: `✓ chrome_updater.exe   ENCERRADO   212 MB` */
export function KillFeedItem({ alvo, acaoLabel, quantidade, leaving, onClick }: Props) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`feed-item ${leaving ? 'feed-out' : 'feed-in'} ${onClick ? 'cursor-pointer hover:bg-surface-2' : ''}`} onClick={onClick}>
      <IconCheck width={14} height={14} className="shrink-0 text-ink-1" />
      <span className="type-num min-w-0 flex-1 truncate text-[11px] text-ink-1">{alvo}</span>
      <span className="shrink-0 text-[9px] font-bold tracking-[0.1em] text-ink-3">{acaoLabel}</span>
      {quantidade && <span className="type-num shrink-0 text-[11px] font-bold text-signal">{quantidade}</span>}
    </Tag>
  )
}
