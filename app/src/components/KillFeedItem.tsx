import './kit.css'

interface Props {
  alvo: string
  acaoLabel: string
  quantidade: string | null
  leaving?: boolean
  onClick?: () => void
}

/** Entrada do kill feed: `chrome_updater.exe ▸ ENCERRADO ▸ 212 MB` */
export function KillFeedItem({ alvo, acaoLabel, quantidade, leaving, onClick }: Props) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={`${leaving ? 'feed-out' : 'feed-in'} block w-full border-r-2 border-signal bg-carbon/95 px-3 py-2 text-left ${onClick ? 'cursor-pointer hover:bg-steel' : ''}`}
      onClick={onClick}
    >
      <span className="type-mono flex items-baseline gap-1.5 text-[11px]">
        <span className="truncate font-bold text-ink-1">{alvo}</span>
        <span className="shrink-0 text-signal">▸</span>
        <span className="shrink-0 font-bold text-ink-2">{acaoLabel}</span>
        {quantidade && (
          <>
            <span className="shrink-0 text-signal">▸</span>
            <span className="shrink-0 text-heat">{quantidade}</span>
          </>
        )}
      </span>
    </Tag>
  )
}
