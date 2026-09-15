import { useEffect, useMemo, useState } from 'react'
import { BRAND } from '../../brand'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { useT } from '../../i18n'
import { isTauriEnv } from '../../services/adapter'
import { licenseDict } from './i18n'
import './license.css'

export interface LicenseState {
  allowed: boolean
  status: string
  planName: string | null
  expiresAt: string | null
  offline: boolean
  errorCode: string | null
}

type Phase = 'checking' | 'ready' | 'activating'

function normalizeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 64)
}

export function LicenseGate({ onGranted }: { onGranted: (state: LicenseState) => void }) {
  const t = useT(licenseDict)
  const [phase, setPhase] = useState<Phase>('checking')
  const [key, setKey] = useState('')
  const [errorCode, setErrorCode] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    // Navegador (mock) e `tauri dev` liberam sem backend de licença. `import.meta.env.DEV`
    // é false no `tauri build`, então este atalho não existe no binário de release.
    if (!isTauriEnv() || import.meta.env.DEV) {
      onGranted({ allowed: true, status: 'DEV', planName: 'DEV', expiresAt: null, offline: false, errorCode: null })
      return
    }
    void (async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      const state = await invoke<LicenseState>('license_check').catch(() => null)
      if (!alive) return
      if (state?.allowed) onGranted(state)
      else {
        setErrorCode(state?.errorCode ?? null)
        setPhase('ready')
      }
    })()
    return () => {
      alive = false
    }
  }, [onGranted])

  const error = useMemo(() => {
    if (!errorCode) return null
    if (errorCode === 'ERR_INVALID_KEY' || errorCode === 'ERR_INVALID_BODY') return t('errInvalid')
    if (errorCode === 'ERR_LICENSE_NOT_FOUND') return t('errNotFound')
    if (errorCode === 'ERR_LICENSE_EXPIRED') return t('errExpired')
    if (errorCode === 'ERR_LICENSE_SUSPENDED' || errorCode === 'ERR_LICENSE_BLOCKED') return t('errSuspended')
    if (errorCode === 'ERR_LICENSE_REVOKED' || errorCode === 'ERR_DEVICE_REVOKED') return t('errRevoked')
    if (['ERR_DEVICE_LIMIT', 'ERR_INSTALLATION_ALREADY_CONSUMED', 'ERR_DEVICE_NOT_BOUND'].includes(errorCode)) return t('errDevice')
    if (errorCode === 'ERR_APP_OUTDATED') return t('errOutdated')
    if (errorCode === 'ERR_API_NOT_CONFIGURED' || errorCode === 'ERR_API_URL_INVALID') return t('errConfig')
    if (errorCode === 'ERR_API_UNAVAILABLE' || errorCode === 'ERR_OFFLINE_GRACE_EXPIRED') return t('errOffline')
    return t('errGeneric')
  }, [errorCode, t])

  const activate = async () => {
    if (!key.trim()) {
      setErrorCode('ERR_INVALID_KEY')
      return
    }
    setPhase('activating')
    setErrorCode(null)
    const { invoke } = await import('@tauri-apps/api/core')
    const state = await invoke<LicenseState>('license_activate', { key }).catch(() => null)
    if (state?.allowed) {
      onGranted(state)
      return
    }
    setErrorCode(state?.errorCode ?? 'ERR_API_UNAVAILABLE')
    setPhase('ready')
  }

  return (
    <main className="license-gate stage-grid">
      <div className="license-scan" aria-hidden />
      <section className="license-card scanlines" aria-live="polite">
        <div className="license-brand" data-tauri-drag-region>
          <span className="type-display">{BRAND.name}</span>
          <div className="license-window-controls">
            <i className="circle" aria-hidden />
            <button aria-label={t('minimize')} onClick={() => void getCurrentWindow().minimize()}>−</button>
            <button aria-label={t('close')} onClick={() => void invoke('close_license_window')}>×</button>
          </div>
        </div>
        <div className="rule-fade" />
        {phase === 'checking' ? (
          <div className="license-checking">
            <span className="type-kicker">{t('checking')}</span>
            <div className="license-segments" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
          </div>
        ) : (
          <>
            <p className="type-kicker license-kicker">{t('kicker')}</p>
            <h1 className="type-display license-title">{t('title')}</h1>
            <p className="license-subtitle">{t('subtitle')}</p>
            <label className="type-kicker license-label" htmlFor="license-key">{t('label')}</label>
            <input
              id="license-key"
              className="type-mono license-input"
              value={key}
              onChange={(event) => setKey(normalizeKey(event.target.value))}
              onKeyDown={(event) => { if (event.key === 'Enter' && phase === 'ready') void activate() }}
              placeholder={t('placeholder')}
              autoComplete="off"
              spellCheck={false}
              disabled={phase === 'activating'}
              autoFocus
            />
            {error && <div className="license-error"><span>×</span>{error}</div>}
            <button className="type-display license-activate" disabled={phase === 'activating'} onClick={() => void activate()}>
              {phase === 'activating' ? t('activating') : t('activate')}
            </button>
            <p className="type-mono license-secure">{t('secure')}</p>
            <div className="license-help">
              <b>{t('noKey')}</b>
              <span>{t('panel')}</span>
              <div className="license-links">
                <button className="type-display license-buy" onClick={() => void invoke('open_site', { page: 'planos' })}>
                  {t('buy')}
                </button>
                <button className="license-link" onClick={() => void invoke('open_site', { page: 'painel' })}>
                  {t('myPanel')}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <footer className="type-mono license-footer">{BRAND.versionLine}</footer>
    </main>
  )
}
