import { useState } from 'react'
import { useT } from '../i18n'
import { shellDict } from './i18n'
import { useSettingsStore } from '../stores/settings'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'
import { BRAND } from '../brand'

const FLAG = 'resync-firstrun'

export function firstRunPending(): boolean {
  return localStorage.getItem(FLAG) !== '1'
}

/** Primeiro acesso: o que o app altera e o padrão de ponto de restauração. */
export function FirstRun({ onDone }: { onDone: () => void }) {
  const t = useT(shellDict)
  const update = useSettingsStore((s) => s.update)
  const [restauracao, setRestauracao] = useState(true)

  const comecar = () => {
    update({ pontoRestauracaoPadrao: restauracao })
    localStorage.setItem(FLAG, '1')
    onDone()
  }

  return (
    <Modal open title={`${t('firstrun.titulo')} — ${BRAND.name}`} width={620}>
      <p className="mb-5 text-sm leading-relaxed text-ink-2">{t('firstrun.corpo')}</p>

      <label className="mb-5 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={restauracao}
          onChange={(e) => setRestauracao(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]"
        />
        <span className="text-xs leading-relaxed text-ink-2">{t('firstrun.restauracao')}</span>
      </label>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={comecar}>
          {t('firstrun.comecar')}
        </Button>
      </div>
    </Modal>
  )
}
