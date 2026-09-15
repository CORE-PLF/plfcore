import { useState } from 'react'
import { useT } from '../i18n'
import { shellDict } from './i18n'
import { useSettingsStore } from '../stores/settings'
import { isTauriEnv } from '../services/adapter'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'
import { RadioCard } from '../components/RadioCard'
import { IconCheck } from '../components/icons'
import { kitDict } from '../components/i18n'
import { BRAND } from '../brand'

const FLAG = 'plfcore-firstrun'

export function firstRunPending(): boolean {
  return localStorage.getItem(FLAG) !== '1'
}

/** Primeiro acesso: o que o app altera, fonte de dados e o padrão de ponto de restauração. */
export function FirstRun({ onDone }: { onDone: () => void }) {
  const t = useT(shellDict)
  const tk = useT(kitDict)
  const update = useSettingsStore((s) => s.update)
  const [restauracao, setRestauracao] = useState(true)
  const [demo, setDemo] = useState(!isTauriEnv())

  const comecar = () => {
    update({ pontoRestauracaoPadrao: restauracao, modoDemo: demo })
    localStorage.setItem(FLAG, '1')
    onDone()
  }

  return (
    <Modal open title={BRAND.name} width={640}>
      {/* i18n entrega o título em caps; o painel usa caixa normal */}
      <h2 className="mb-2 text-[26px] font-bold tracking-[-0.02em] text-ink-1 lowercase first-letter:uppercase">{t('firstrun.titulo')}</h2>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-2">{t('firstrun.corpo')}</p>

      <p className="type-kicker mb-2">{t('firstrun.modoTitulo')}</p>
      <div role="radiogroup" aria-label={t('firstrun.modoTitulo')} className="mb-5 grid grid-cols-2 gap-3">
        <RadioCard
          checked={!demo}
          onSelect={() => setDemo(false)}
          title={t('firstrun.real')}
          description={t('firstrun.realDesc')}
          badge={tk('real')}
        />
        <RadioCard
          checked={demo}
          onSelect={() => setDemo(true)}
          title={t('firstrun.demo')}
          description={t('firstrun.demoDesc')}
          badge={tk('demo')}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={restauracao} onChange={(e) => setRestauracao(e.target.checked)} className="sr-only" />
        <span className={`checkbox mt-0.5 ${restauracao ? 'checkbox--on' : ''}`} aria-hidden>
          {restauracao && <IconCheck width={11} height={11} strokeWidth={2.2} />}
        </span>
        <span className="text-xs leading-relaxed text-ink-2">{t('firstrun.restauracao')}</span>
      </label>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" size="lg" onClick={comecar}>
          {t('firstrun.comecar')}
        </Button>
      </div>
    </Modal>
  )
}
