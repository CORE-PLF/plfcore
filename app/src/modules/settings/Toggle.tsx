import { useT } from '../../i18n'
import { sfx } from '../../services/sfx'
import { dict } from './i18n'
import './settings.css'

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  /** rótulo acessível (o rótulo visual fica na linha) */
  label: string
  disabled?: boolean
}

/** Switch quadrado mini: knob desliza + texto ON/OFF — estado nunca só por cor. */
export function Toggle({ checked, onChange, label, disabled }: Props) {
  const t = useT(dict)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="pfx-toggle"
      onClick={() => {
        sfx.click()
        onChange(!checked)
      }}
    >
      <span className="track" aria-hidden />
      <span className="state">{checked ? t('ligado') : t('desligado')}</span>
    </button>
  )
}
