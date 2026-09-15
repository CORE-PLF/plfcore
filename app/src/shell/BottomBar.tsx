import { useT } from '../i18n'
import { shellDict } from './i18n'
import { kitDict } from '../components/i18n'
import { useJobsStore, selectJobAtivo } from '../stores/jobs'
import { useSettingsStore } from '../stores/settings'
import { isTauriEnv } from '../services/adapter'
import type { ScreenId } from '../stores/nav'
import './shell.css'

const NAV_IDS: ReadonlyArray<string> = [
  'cockpit', 'xray', 'memory', 'cleanup', 'windows', 'latency', 'bottleneck', 'stop', 'settings', 'log',
]
const ESTADOS_VIVOS: ReadonlyArray<string> = ['preparing', 'scanning', 'running', 'applying']

/** Barra fina de atividade: `IDLE` ou `LIMPEZA: VARRENDO … 62%`, e a fonte dos dados à direita. */
export function BottomBar({ stagger }: { stagger: boolean }) {
  const t = useT(shellDict)
  const tk = useT(kitDict)
  const ativo = useJobsStore(selectJobAtivo)
  const modoDemo = useSettingsStore((s) => s.modoDemo)
  const real = isTauriEnv() && !modoDemo

  let texto = t('status.idle')
  if (ativo) {
    const modulo = NAV_IDS.includes(ativo.moduloId)
      ? t(`nav.${ativo.moduloId as ScreenId}` as const)
      : ativo.moduloId.toUpperCase()
    const estado = ESTADOS_VIVOS.includes(ativo.state)
      ? t(`job.state.${ativo.state as 'running'}` as const)
      : ativo.state.toUpperCase()
    const pct = ativo.progressoPct !== null ? ` … ${Math.round(ativo.progressoPct)}%` : ''
    texto = `${modulo}: ${estado}${pct}`
  }

  return (
    <footer className={`bottombar ${stagger ? 'hud-in' : ''}`} style={{ animationDelay: '80ms' }}>
      <span className={`led ${ativo ? 'led--live' : 'led--off'}`} style={{ width: 6, height: 6 }} aria-hidden />
      <span aria-live="polite">{texto}</span>
      <span className="bottombar-source">{t('status.fonte')}: {real ? tk('real') : t('status.fonteDemo')}</span>
    </footer>
  )
}
