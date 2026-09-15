import { useEffect, useState } from 'react'
import { AppShell } from './shell/AppShell'
import { Ignition } from './shell/Ignition'
import { FirstRun, firstRunPending } from './shell/FirstRun'
import { MatchOverlay } from './modules/matchoverlay/MatchOverlay'
import { useSettingsStore } from './stores/settings'
import { useToastsStore } from './stores/toasts'
import { useLocaleStore, t as tr } from './i18n'
import { shellDict } from './shell/i18n'
import { isTauriEnv } from './services/adapter'
import { sfx } from './services/sfx'
import { startGameSense } from './services/gamesense'
import { LicenseGate, type LicenseState } from './modules/license/LicenseGate'

const IGNITED = 'resync-ignited'
const ELEV_AVISADO = 'resync-elev-avisado'

export default function App() {
  const [licenseGranted, setLicenseGranted] = useState(false)
  const [ignited, setIgnited] = useState(() => sessionStorage.getItem(IGNITED) === '1')
  const [firstRun, setFirstRun] = useState(firstRunPending)
  const somAtivo = useSettingsStore((s) => s.somAtivo)
  const somVolume = useSettingsStore((s) => s.somVolume)
  const intensidade = useSettingsStore((s) => s.intensidadeAnimacao)
  const locale = useLocaleStore((s) => s.locale)

  useEffect(() => {
    sfx.configure({ enabled: somAtivo, volume: somVolume })
  }, [somAtivo, somVolume])

  useEffect(() => {
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale
  }, [locale])

  useEffect(() => {
    document.documentElement.dataset.anim = intensidade
  }, [intensidade])

  useEffect(() => {
    if (licenseGranted && ignited && !firstRun) startGameSense()
  }, [licenseGranted, ignited, firstRun])

  useEffect(() => {
    if (!licenseGranted || !isTauriEnv()) return
    let alive = true
    const heartbeat = async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      const state = await invoke<LicenseState>('license_heartbeat').catch(() => null)
      if (alive && state && !state.allowed) setLicenseGranted(false)
    }
    const timer = window.setInterval(() => void heartbeat(), 15 * 60_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [licenseGranted])

  // modo REAL sem elevação: SMART/limpeza de sistema ficam limitados — oferece reiniciar como admin
  const modoDemo = useSettingsStore((s) => s.modoDemo)
  useEffect(() => {
    if (!licenseGranted || !ignited || firstRun || modoDemo || !isTauriEnv()) return
    if (sessionStorage.getItem(ELEV_AVISADO) === '1') return
    void (async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      const elevado = await invoke<boolean>('is_elevated').catch(() => true)
      if (elevado) return
      sessionStorage.setItem(ELEV_AVISADO, '1')
      useToastsStore.getState().push({
        tipo: 'aviso',
        mensagem: tr(shellDict, 'elev.msg'),
        acao: {
          labelKey: tr(shellDict, 'elev.acao'),
          run: () => {
            void invoke('relaunch_elevated')
          },
        },
      })
    })()
  }, [licenseGranted, ignited, firstRun, modoDemo])

  if (!licenseGranted) {
    return <LicenseGate onGranted={() => setLicenseGranted(true)} />
  }

  return (
    <>
      <AppShell stagger={ignited} />
      <MatchOverlay />
      {ignited && firstRun && <FirstRun onDone={() => setFirstRun(false)} />}
      {!ignited && (
        <Ignition
          onDone={() => {
            sessionStorage.setItem(IGNITED, '1')
            setIgnited(true)
          }}
        />
      )}
    </>
  )
}
