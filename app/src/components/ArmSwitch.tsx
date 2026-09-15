import { useT } from '../i18n'
import { kitDict } from './i18n'
import { sfx } from '../services/sfx'
import './kit.css'

interface Props {
  armed: boolean
  onChange: (armed: boolean) => void
  disabled?: boolean
}

export function ArmSwitch({ armed, onChange, disabled }: Props) {
  const t = useT(kitDict)
  return (
    <button
      role="switch"
      aria-checked={armed}
      disabled={disabled}
      className="armswitch"
      onClick={() => {
        sfx.click()
        onChange(!armed)
      }}
    >
      <span className="rail" aria-hidden />
      {armed ? t('armado') : t('armar')}
    </button>
  )
}
