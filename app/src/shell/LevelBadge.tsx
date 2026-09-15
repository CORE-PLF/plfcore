import { useT } from '../i18n'
import { shellDict } from './i18n'
import { useLevelStore } from '../stores/level'
import { useNav } from '../stores/nav'
import { sfx } from '../services/sfx'
import './shell.css'

/** Leitura do nível aplicado. Quem opera é a tela WINDOWS — este selo só leva até lá. */
export function LevelBadge() {
  const t = useT(shellDict)
  const atual = useLevelStore((s) => s.atual)
  const go = useNav((s) => s.go)
  const quente = atual <= 2

  return (
    <button
      className={`levelbadge ${quente ? 'levelbadge--hot' : ''}`}
      title={t('level.abrir')}
      aria-label={`${t('level.title')} — L${atual} ${t(`level.nome.${atual}` as const)}`}
      onClick={() => {
        sfx.click()
        go('windows')
      }}
    >
      <span className="hidden xl:inline">{t('level.titleCurto')}</span>
      <span className="levelbadge-value">
        L{atual} <span className="hidden lg:inline">{t(`level.nome.${atual}` as const)}</span>
      </span>
    </button>
  )
}
