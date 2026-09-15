import { useT } from '../i18n'
import { shellDict } from './i18n'
import { useJobsStore, selectJobAtivo } from '../stores/jobs'
import type { ScreenId } from '../stores/nav'
import './shell.css'

const NAV_IDS: ReadonlyArray<string> = [
  'cockpit', 'xray', 'memory', 'cleanup', 'windows', 'latency', 'bottleneck', 'stop', 'settings', 'log',
]
const ESTADOS_VIVOS: ReadonlyArray<string> = ['preparing', 'scanning', 'running', 'applying']

/** Barra fina de atividade: `IDLE` ou `LIMPEZA: VARRENDO … 62%`. */
export function BottomBar({ stagger }: { stagger: boolean }) {
  const t = useT(shellDict)
  const ativo = useJobsStore(selectJobAtivo)

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
      <span className={`led circle ${ativo ? 'led--heat' : 'led--off led--slow'}`} style={{ width: 6, height: 6 }} aria-hidden />
      <span aria-live="polite">{texto}</span>
    </footer>
  )
}
