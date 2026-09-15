import { useT } from '../i18n'
import { shellDict } from './i18n'
import { kitDict } from '../components/i18n'
import { useNav, type ScreenId } from '../stores/nav'
import { useSettingsStore } from '../stores/settings'
import { isTauriEnv } from '../services/adapter'
import { BRAND } from '../brand'
import { sfx } from '../services/sfx'
import { IconChevron } from '../components/icons'
import './shell.css'

// Ícones geométricos no grid do sistema, 16×16, traço 1.5.
const NAV_ICONS: Record<ScreenId, React.ReactNode> = {
  cockpit: <path d="M3 12a5.5 5.5 0 0 1 10 0M8 12 11 7" />,
  fpsboost: <path d="M9 1.5 3.5 9H7l-.5 5.5L12.5 7H9l0-5.5Z" />,
  xray: <><circle cx="8" cy="8" r="5" /><path d="M8 1v3M8 12v3M1 8h3M12 8h3" /></>,
  memory: <><rect x="2.5" y="4.5" width="11" height="7" /><path d="M4.5 11.5v2M7.5 11.5v2M10.5 11.5v2M4.5 2.5v2M7.5 2.5v2M10.5 2.5v2" /></>,
  cleanup: <><path d="M6 2h4v4l3 7H3l3-7V2Z" /><path d="M6 9h4" /></>,
  windows: <><rect x="2.5" y="2.5" width="11" height="11" /><path d="M2.5 8h11M8 2.5v11" /></>,
  games: <><rect x="1.5" y="4.5" width="13" height="7" /><path d="M4 6.5v3M2.5 8h3M10 7.5h.01M12 9.5h.01" /></>,
  runtimes: <><rect x="2.5" y="2.5" width="11" height="11" /><path d="M5.5 8.5 7.5 10.5 11 6" /></>,
  tweaks: <><path d="M2 4.5h12M2 8h12M2 11.5h12" /><path d="M5.5 3v3M10.5 6.5v3M4 10v3" /></>,
  startup: <><path d="M8 14V5" /><path d="M4.5 8.5 8 5l3.5 3.5" /><path d="M2.5 2.5h11" /></>,
  latency: <path d="M1 8h3l2-4 3 8 2-4h4" />,
  bottleneck: <path d="M2 2h12L9.5 8v5L6.5 14V8L2 2Z" />,
  stop: <path d="M5 2h6l3 3v6l-3 3H5l-3-3V5l3-3Z" />,
  settings: <><rect x="5" y="5" width="6" height="6" /><path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15M3 3l1.8 1.8M11.2 11.2 13 13M13 3l-1.8 1.8M4.8 11.2 3 13" /></>,
  log: <><rect x="2.5" y="5.5" width="11" height="8" /><path d="M2.5 5.5 5 2.5h6l2.5 3M8 8.5v2.5" /></>,
}

const MAIN: ScreenId[] = ['cockpit', 'fpsboost', 'xray', 'memory', 'cleanup', 'windows', 'games', 'runtimes', 'tweaks', 'startup', 'latency', 'bottleneck']
const FOOTER: ScreenId[] = ['settings', 'log']

function NavIcon({ id }: { id: ScreenId }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      {NAV_ICONS[id]}
    </svg>
  )
}

export function Sidebar({ collapsed, onToggle, stagger }: { collapsed: boolean; onToggle: () => void; stagger: boolean }) {
  const t = useT(shellDict)
  const tk = useT(kitDict)
  const { screen, go } = useNav()
  const modoDemo = useSettingsStore((s) => s.modoDemo)
  const real = isTauriEnv() && !modoDemo

  const item = (id: ScreenId) => (
    <button
      key={id}
      className={`navitem ${id === 'fpsboost' ? 'navitem--critical' : ''} ${screen === id ? 'active' : ''}`}
      title={collapsed ? t(`nav.${id}`) : undefined}
      aria-current={screen === id ? 'page' : undefined}
      onClick={() => {
        sfx.click()
        go(id)
      }}
    >
      <NavIcon id={id} />
      <span>{t(`nav.${id}`)}</span>
    </button>
  )

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${stagger ? 'hud-in' : ''}`} style={{ animationDelay: '0ms' }}>
      <div className="flex min-h-[52px] items-center gap-2 border-b border-line px-4">
        <span className="type-display whitespace-nowrap text-xl text-ink-1">
          {collapsed ? BRAND.shortName.slice(0, 2) : BRAND.name}
        </span>
        {!collapsed && <span className="led circle led--live" style={{ width: 5, height: 5 }} aria-hidden />}
      </div>
      <nav aria-label="principal">{MAIN.map(item)}</nav>
      <div className="border-t border-line pb-2">
        {FOOTER.map(item)}
        <button
          className="navitem"
          onClick={onToggle}
          aria-label={collapsed ? t('nav.expandir') : t('nav.recolher')}
          title={collapsed ? t('nav.expandir') : t('nav.recolher')}
        >
          <IconChevron style={{ transform: collapsed ? 'none' : 'rotate(180deg)' }} />
          <span className="type-mono text-[10px] not-italic tracking-[0.1em]">{t('nav.recolher')}</span>
        </button>
        {!collapsed && (
          <div className="flex items-center justify-between px-5 pt-1">
            <span className="type-mono text-[9px] tracking-wide text-ink-4">{BRAND.versionLine}</span>
            <span className={`tag ${real ? 'tag--ok' : 'tag--demo'}`}>{real ? tk('real') : tk('demo')}</span>
          </div>
        )}
      </div>
    </aside>
  )
}
