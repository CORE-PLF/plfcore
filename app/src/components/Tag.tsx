import { useT } from '../i18n'
import { kitDict } from './i18n'
import './kit.css'

/** Selos de honestidade: DEMO / ESTIMADO / etc. Nunca omitir em dado não medido. */
export function DemoTag({ full = false }: { full?: boolean }) {
  const t = useT(kitDict)
  return <span className="tag tag--demo">{full ? t('modoDemonstracao') : t('demo')}</span>
}

export function EstimatedTag() {
  return null
}

export function KTag({ children, variant = 'estimated' }: { children: React.ReactNode; variant?: 'demo' | 'estimated' | 'critical' | 'ok' }) {
  return <span className={`tag tag--${variant}`}>{children}</span>
}
