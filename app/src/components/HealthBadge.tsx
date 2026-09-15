import { IconCheck, IconWarn } from './icons'
import { useT } from '../i18n'
import { kitDict } from './i18n'
import './kit.css'

/** Saúde SMART/estado: nunca só cor — sempre ícone/padrão + texto. */
export function HealthBadge({ status }: { status: 'saudavel' | 'atencao' | 'critico' }) {
  const t = useT(kitDict)
  if (status === 'saudavel')
    return (
      <span className="tag tag--ok">
        <IconCheck width={10} height={10} /> {t('saudavel')}
      </span>
    )
  if (status === 'atencao')
    return (
      <span className="tag" style={{ color: 'var(--color-heat)' }}>
        <IconWarn width={10} height={10} /> {t('atencao')}
      </span>
    )
  return (
    <span className="tag tag--critical">
      <IconWarn width={10} height={10} /> {t('critico')}
    </span>
  )
}
