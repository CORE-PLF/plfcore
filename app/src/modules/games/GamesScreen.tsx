import { useT } from '../../i18n'
import { ScreenTitle } from '../../components/Kicker'
import { FivemPanel } from './FivemPanel'
import { dict } from './i18n'
import './games.css'

export default function GamesScreen() {
  const t = useT(dict)

  return (
    <div className="p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} />
      <FivemPanel />
    </div>
  )
}
