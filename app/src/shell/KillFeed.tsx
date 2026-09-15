import { useT } from '../i18n'
import { shellDict } from './i18n'
import { useKillfeedStore } from '../stores/killfeed'
import { useNav } from '../stores/nav'
import { KillFeedItem } from '../components/KillFeedItem'
import './shell.css'

/** Feed lateral de resultado em tempo real — o coração da experiência. */
export function KillFeed() {
  const t = useT(shellDict)
  const visiveis = useKillfeedStore((s) => s.visiveis)
  const go = useNav((s) => s.go)

  if (visiveis.length === 0) return null
  return (
    <div className="killfeedhost" role="log" aria-live="polite">
      {visiveis.map((e) => (
        <KillFeedItem
          key={e.id}
          alvo={e.alvo}
          acaoLabel={t(`feed.${e.acao}` as const)}
          quantidade={e.quantidade}
          onClick={e.logId ? () => go('log', e.logId ?? undefined) : undefined}
        />
      ))}
    </div>
  )
}
