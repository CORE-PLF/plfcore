import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { shellDict } from './i18n'
import { BRAND } from '../brand'
import { sfx } from '../services/sfx'
import { getInventoryCached } from '../services/inventoryCache'
import { firstRunPending } from './FirstRun'
import './shell.css'

/**
 * IGNIÇÃO — roda uma única vez por sessão, ~1.4s, pulável por qualquer tecla.
 * linha varre → logo revela por máscara → um flicker → HUD monta (no AppShell) → LED pronto.
 */
export function Ignition({ onDone }: { onDone: () => void }) {
  const t = useT(shellDict)
  const [lifting, setLifting] = useState(false)
  const finished = useRef(false)

  useEffect(() => {
    sfx.hum()
    // coleta specs em background enquanto anima — mas nunca antes do usuário
    // escolher a fonte (REAL/DEMO), senão o cache nasce com a fonte errada
    if (!firstRunPending()) void getInventoryCached()

    const finish = () => {
      if (finished.current) return
      finished.current = true
      setLifting(true)
      setTimeout(onDone, 260)
    }
    const timer = setTimeout(finish, 1150)
    const skip = () => finish()
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [onDone])

  return (
    <div className={`ignition ${lifting ? 'lifting' : ''}`} role="presentation">
      <div className="ign-line" aria-hidden />
      <div className="ign-flicker">
        <span className="type-display ign-logo block text-7xl">{BRAND.name}</span>
      </div>
      <p className="type-mono ign-skip text-[10px] tracking-[0.2em] text-ink-4">{t('ignition.skip')}</p>
    </div>
  )
}
