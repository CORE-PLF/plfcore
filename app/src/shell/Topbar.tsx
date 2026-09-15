import { useT } from '../i18n'
import { shellDict } from './i18n'
import { useNav } from '../stores/nav'
import { isTauriEnv } from '../services/adapter'
import { LevelBadge } from './LevelBadge'
import { StatusLED } from '../components/StatusLED'
import { IconMinus, IconSquare, IconTray, IconX } from '../components/icons'
import './shell.css'

async function winAction(action: 'min' | 'max' | 'close') {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const w = getCurrentWindow()
  if (action === 'min') await w.minimize()
  else if (action === 'max') await w.toggleMaximize()
  else await w.close()
}

async function toTray(abrir: string, sair: string) {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('hide_to_tray', { abrir, sair })
}

export function Topbar({ stagger }: { stagger: boolean }) {
  const t = useT(shellDict)
  const screen = useNav((s) => s.screen)
  const tauri = isTauriEnv()

  return (
    <header className={`topbar ${stagger ? 'hud-in' : ''}`} style={{ animationDelay: '40ms' }} data-tauri-drag-region>
      <h2 className="type-display pointer-events-none text-lg" aria-live="polite">
        {t(`nav.${screen}`)}
      </h2>
      <div className="ml-auto flex items-center gap-4">
        <LevelBadge />
        <StatusLED state="live" label={t('status.pronto')} className="hidden md:inline-flex" />
        <div className="flex">
          <button className="winbtn" aria-label={t('win.tray')} title={tauri ? t('win.tray') : t('win.soWeb')} disabled={!tauri} onClick={() => void toTray(t('win.trayAbrir'), t('win.traySair'))}>
            <IconTray width={13} height={13} />
          </button>
          <button className="winbtn" aria-label={t('win.min')} title={tauri ? t('win.min') : t('win.soWeb')} disabled={!tauri} onClick={() => void winAction('min')}>
            <IconMinus width={12} height={12} />
          </button>
          <button className="winbtn" aria-label={t('win.max')} title={tauri ? t('win.max') : t('win.soWeb')} disabled={!tauri} onClick={() => void winAction('max')}>
            <IconSquare width={12} height={12} />
          </button>
          <button className="winbtn close" aria-label={t('win.close')} title={tauri ? t('win.close') : t('win.soWeb')} disabled={!tauri} onClick={() => void winAction('close')}>
            <IconX width={13} height={13} />
          </button>
        </div>
      </div>
    </header>
  )
}
