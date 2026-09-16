import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { shellDict } from './i18n'
import { isTauriEnv } from '../services/adapter'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { IconWarn } from '../components/icons'

interface UpdateState {
  atual: string
  disponivel: string
  temNova: boolean
  notas: string
}

/**
 * Uma checagem por abertura do app. Atualização não é urgência: se a rede ou o
 * servidor falharem, nada aparece e ninguém recebe erro.
 */
export function UpdateBadge() {
  const t = useT(shellDict)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!isTauriEnv()) return
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const resultado = await invoke<UpdateState>('check_app_update')
        if (resultado.temNova) setUpdate(resultado)
      } catch {
        // silêncio proposital
      }
    })()
  }, [])

  if (!update) return null

  const baixar = async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      await invoke('open_site', { page: 'download' })
    } catch {
      // silêncio proposital
    }
    setAberto(false)
  }

  return (
    <>
      <button
        type="button"
        className="pill gap-1.5 border-signal font-bold tracking-[0.06em] text-signal transition-[filter] hover:brightness-125"
        title={t('update.abrir')}
        aria-label={t('update.abrir')}
        onClick={() => setAberto(true)}
      >
        <IconWarn width={12} height={12} />
        {t('update.pill')}
      </button>

      {aberto && (
        <Modal open title={t('update.titulo')} onClose={() => setAberto(false)}>
          <dl className="mb-4">
            <div className="datarow rounded-md">
              <dt className="type-kicker">{t('update.atual')}</dt>
              <dd className="type-num text-xs font-bold text-ink-1">{update.atual}</dd>
            </div>
            <div className="datarow rounded-md">
              <dt className="type-kicker">{t('update.nova')}</dt>
              <dd className="type-num text-xs font-bold text-signal">{update.disponivel}</dd>
            </div>
          </dl>
          {update.notas.trim() !== '' && (
            <>
              <p className="type-kicker mb-2">{t('update.notas')}</p>
              <p className="mb-1 whitespace-pre-line text-sm leading-relaxed text-ink-2">{update.notas}</p>
            </>
          )}
          <div className="mt-5 flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              {t('update.depois')}
            </Button>
            <Button variant="primary" onClick={() => void baixar()}>
              {t('update.baixar')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
