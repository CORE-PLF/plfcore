import { useState } from 'react'
import type { AppSettings } from '../../types'
import { LOCALES, useLocaleStore, useT } from '../../i18n'
import type { Locale } from '../../i18n'
import { useSettingsStore } from '../../stores/settings'
import { registerRevert, useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import { getAdapter, isTauriEnv } from '../../services/adapter'
import { sfx } from '../../services/sfx'
import { BRAND } from '../../brand'
import { ChamferSurface } from '../../components/ChamferSurface'
import { ScreenTitle } from '../../components/Kicker'
import { Button } from '../../components/Button'
import { HoldButton } from '../../components/HoldButton'
import { Modal, ResultModal } from '../../components/Modal'
import { MetricRow } from '../../components/MetricRow'
import { RadioCard } from '../../components/RadioCard'
import { RangeSlider } from '../../components/RangeSlider'
import { IconChevron } from '../../components/icons'
import { kitDict } from '../../components/i18n'
import { dict } from './i18n'
import { Toggle } from './Toggle'
import './settings.css'

// Espelho explícito dos defaults da store — o reset aplica exatamente isto.
const DEFAULTS: AppSettings = {
  iniciarComWindows: false,
  minimizarBandeja: true,
  intensidadeAnimacao: 'total',
  somAtivo: true,
  somVolume: 0.2,
  notificacoes: true,
  modoDemo: false,
  confirmarAntesLimpar: true,
  pontoRestauracaoPadrao: true,
  dadosAvancados: false,
  atalhoModoPartida: 'Ctrl+Shift+F9',
}

const MODIFICADORES = ['Control', 'Alt', 'Shift', 'Meta']

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ChamferSurface cut={8} flat>
      <section className="p-5" aria-label={title}>
        <h2 className="type-display text-xl">{title}</h2>
        <div className="rule-fade mt-2 mb-1 w-40" />
        {children}
      </section>
    </ChamferSurface>
  )
}

function Row({
  label,
  note,
  tag,
  children,
}: {
  label: string
  note?: string
  tag?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="type-kicker">{label}</span>
          {tag}
        </div>
        {note && <p className="mt-1 text-[11px] leading-snug text-ink-3">{note}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ShortcutField() {
  const t = useT(dict)
  const atalho = useSettingsStore((s) => s.atalhoModoPartida)
  const update = useSettingsStore((s) => s.update)
  const [capturing, setCapturing] = useState(false)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!capturing) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setCapturing(true)
      }
      return
    }
    e.preventDefault()
    if (e.key === 'Escape') {
      setCapturing(false)
      return
    }
    if (MODIFICADORES.includes(e.key)) return
    const fKey = /^F\d{1,2}$/.test(e.key)
    // exige modificador (ou tecla F) — tecla solta não vira atalho global
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !fKey) return
    const tecla = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
    const combo = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', tecla]
      .filter(Boolean)
      .join('+')
    update({ atalhoModoPartida: combo })
    setCapturing(false)
    sfx.click()
  }

  return (
    <ChamferSurface cut={4} flat edge={capturing ? 'var(--color-signal)' : undefined} className="inline-block">
      <input
        readOnly
        className={`pfx-shortcut ${capturing ? 'capturing' : ''}`}
        value={capturing ? t('atalhoCapturando') : atalho}
        aria-label={t('atalho')}
        onClick={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={onKeyDown}
      />
    </ChamferSurface>
  )
}

export default function SettingsScreen() {
  const t = useT(dict)
  const tk = useT(kitDict)
  const settings = useSettingsStore()
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  const pushToast = useToastsStore((s) => s.push)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  const onOff = (b: boolean) => (b ? t('ligado') : t('desligado'))

  const exportLogs = async () => {
    const { logs, exportText, log } = useLogStore.getState()
    if (logs.length === 0) {
      pushToast({ tipo: 'aviso', mensagem: t('exportVazio') })
      return
    }
    const nome = `${BRAND.shortName.toLowerCase()}-log-${new Date().toISOString().slice(0, 10)}.txt`
    const conteudo = exportText()
    let caminho: string | null = null
    if (isTauriEnv()) {
      try {
        caminho = await getAdapter().exportLogFile(nome, conteudo)
      } catch {
        pushToast({ tipo: 'erro', mensagem: t('exportErro') })
        return
      }
    } else {
      const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/plain' }))
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      a.click()
      URL.revokeObjectURL(url)
    }
    log({
      moduloId: 'settings',
      acao: 'exportar-logs',
      resultado: `${logs.length} registros`,
      reversivel: false,
      detalhes: caminho ?? nome,
    })
    pushToast({
      tipo: 'sucesso',
      mensagem: caminho ? t('exportOkCaminho', { n: logs.length, caminho }) : t('exportOk', { n: logs.length }),
    })
  }

  const doReset = () => {
    const { update, ...anterior } = useSettingsStore.getState()
    const snapshot: AppSettings = { ...anterior }
    update(DEFAULTS)
    const logId = useLogStore.getState().log({
      moduloId: 'settings',
      acao: 'restaurar-padroes',
      resultado: 'ok',
      reversivel: true,
      detalhes: Object.keys(DEFAULTS).join(', '),
    })
    registerRevert(logId, () => useSettingsStore.getState().update(snapshot))
    setResetOpen(false)
    setResetDone(true)
  }

  const animOptions = [
    { id: 'total', title: t('animTotal'), desc: t('animTotalDesc') },
    { id: 'reduzida', title: t('animReduzida'), desc: t('animReduzidaDesc') },
    { id: 'off', title: t('animOff'), desc: t('animOffDesc') },
  ] as const

  const animDefault = { total: t('animTotal'), reduzida: t('animReduzida'), off: t('animOff') }[
    DEFAULTS.intensidadeAnimacao
  ]

  const resetRows: Array<[string, string]> = [
    [t('idioma'), t('mantido')],
    [t('iniciarWindows'), onOff(DEFAULTS.iniciarComWindows)],
    [t('minimizarBandeja'), onOff(DEFAULTS.minimizarBandeja)],
    [t('atalho'), DEFAULTS.atalhoModoPartida],
    [t('anim'), animDefault],
    [t('som'), `${onOff(DEFAULTS.somAtivo)} ${Math.round(DEFAULTS.somVolume * 100)}%`],
    [t('notificacoes'), onOff(DEFAULTS.notificacoes)],
    [t('confirmarLimpar'), onOff(DEFAULTS.confirmarAntesLimpar)],
    [t('pontoRestauracao'), onOff(DEFAULTS.pontoRestauracaoPadrao)],
    [t('dadosAvancados'), onOff(DEFAULTS.dadosAvancados)],
  ]

  const volume = Math.round(settings.somVolume * 100)

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-[1060px]">
        <ScreenTitle kicker={t('kicker')} title={t('title')} />

        <div className="grid grid-cols-[3fr_2fr] items-start gap-6">
          <div className="flex flex-col gap-6">
            <Group title={t('gGeral')}>
              <Row label={t('idioma')}>
                <ChamferSurface cut={4} flat className="pfx-select-wrap">
                  <select
                    className="pfx-select"
                    value={locale}
                    aria-label={t('idioma')}
                    onChange={(e) => {
                      sfx.click()
                      setLocale(e.target.value as Locale)
                    }}
                  >
                    {LOCALES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <IconChevron className="pfx-select-chev" width={12} height={12} />
                </ChamferSurface>
              </Row>
              <Row label={t('iniciarWindows')}>
                <Toggle
                  checked={settings.iniciarComWindows}
                  onChange={(v) => settings.update({ iniciarComWindows: v })}
                  label={t('iniciarWindows')}
                />
              </Row>
              <Row label={t('minimizarBandeja')} note={t('notaBandeja')}>
                <Toggle
                  checked={settings.minimizarBandeja}
                  onChange={(v) => settings.update({ minimizarBandeja: v })}
                  label={t('minimizarBandeja')}
                />
              </Row>
              <Row label={t('atalho')} note={t('atalhoNota')}>
                <ShortcutField />
              </Row>
            </Group>

            <Group title={t('gInterface')}>
              <div className="border-b border-line py-3">
                <span className="type-kicker">{t('anim')}</span>
                <div role="radiogroup" aria-label={t('anim')} className="mt-2 grid grid-cols-3 gap-2">
                  {animOptions.map((o) => (
                    <RadioCard
                      key={o.id}
                      checked={settings.intensidadeAnimacao === o.id}
                      onSelect={() => settings.update({ intensidadeAnimacao: o.id })}
                      title={o.title}
                      description={o.desc}
                    />
                  ))}
                </div>
              </div>
              <Row label={t('som')}>
                <Toggle
                  checked={settings.somAtivo}
                  onChange={(v) => settings.update({ somAtivo: v })}
                  label={t('som')}
                />
              </Row>
              {settings.somAtivo && (
                <div className="border-b border-line pb-3 pt-1">
                  <RangeSlider
                    value={volume}
                    onChange={(v) => settings.update({ somVolume: v / 100 })}
                    min={0}
                    max={100}
                    step={5}
                    liveLabel={t('volumeLive', { v: volume })}
                    ariaLabel={t('volume')}
                  />
                </div>
              )}
              <Row label={t('notificacoes')}>
                <Toggle
                  checked={settings.notificacoes}
                  onChange={(v) => settings.update({ notificacoes: v })}
                  label={t('notificacoes')}
                />
              </Row>
            </Group>
          </div>

          <div className="flex flex-col gap-6">
            <Group title={t('gOperacao')}>
              <Row label={t('confirmarLimpar')}>
                <Toggle
                  checked={settings.confirmarAntesLimpar}
                  onChange={(v) => settings.update({ confirmarAntesLimpar: v })}
                  label={t('confirmarLimpar')}
                />
              </Row>
              <Row label={t('pontoRestauracao')}>
                <Toggle
                  checked={settings.pontoRestauracaoPadrao}
                  onChange={(v) => settings.update({ pontoRestauracaoPadrao: v })}
                  label={t('pontoRestauracao')}
                />
              </Row>
              <Row label={t('dadosAvancados')}>
                <Toggle
                  checked={settings.dadosAvancados}
                  onChange={(v) => settings.update({ dadosAvancados: v })}
                  label={t('dadosAvancados')}
                />
              </Row>
            </Group>

            <Group title={t('gManutencao')}>
              <div className="flex items-center justify-between gap-4 py-3">
                <p className="max-w-[190px] text-[11px] leading-snug text-ink-3">{t('exportNota')}</p>
                <Button onClick={() => void exportLogs()}>{t('exportarLogs')}</Button>
              </div>
              <div className="mt-2">
                <div className="hazard h-1.5" aria-hidden />
                <div className="flex items-center justify-between gap-4 border border-t-0 border-line p-3">
                  <p className="max-w-[190px] text-[11px] leading-snug text-ink-3">{t('zonaNota')}</p>
                  <Button variant="danger" onClick={() => setResetOpen(true)}>
                    {t('restaurar')}
                  </Button>
                </div>
              </div>
            </Group>
          </div>
        </div>
      </div>

      <Modal open={resetOpen} title={t('restaurar')} onClose={() => setResetOpen(false)} danger>
        <p className="mb-3 text-sm text-ink-2">{t('restaurarCorpo')}</p>
        <div className="mb-3">
          {resetRows.map(([l, v]) => (
            <MetricRow key={l} label={l} value={v} />
          ))}
        </div>
        <p className="mb-4 text-[11px] text-ink-3">{t('restaurarNota')}</p>
        <div className="flex items-end justify-between gap-3">
          <Button size="sm" onClick={() => setResetOpen(false)}>
            {tk('cancelar')}
          </Button>
          <div className="flex flex-col items-end gap-1">
            <HoldButton onConfirm={doReset}>{t('restaurar')}</HoldButton>
            <span className="type-kicker">{tk('segureParaConfirmar')}</span>
          </div>
        </div>
      </Modal>

      <ResultModal
        open={resetDone}
        title={t('restaurar')}
        headline={t('restauradoHeadline')}
        onClose={() => setResetDone(false)}
      />
    </div>
  )
}
