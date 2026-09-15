import { useState } from 'react'
import { useT } from '../i18n'
import { shellDict } from './i18n'
import { useRestartStore } from '../stores/restart'
import { useToastsStore } from '../stores/toasts'
import { isTauriEnv } from '../services/adapter'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { HoldButton } from '../components/HoldButton'
import { IconWarn } from '../components/icons'
import './shell.css'

/**
 * Ajuste que só vale após reiniciar não pode virar só uma tag: enquanto houver
 * pendência, a barra fica no topo e leva ao reinício de verdade.
 */
export function RestartBanner() {
  const t = useT(shellDict)
  const { pendente, motivos, limpar } = useRestartStore()
  const [confirmando, setConfirmando] = useState(false)
  const push = useToastsStore((s) => s.push)

  if (!pendente) return null

  const reiniciar = async () => {
    if (!isTauriEnv()) {
      setConfirmando(false)
      push({ tipo: 'aviso', mensagem: t('restart.soDesktop') })
      return
    }
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      await invoke('restart_windows')
      limpar()
      setConfirmando(false)
      push({ tipo: 'info', mensagem: t('restart.indo') })
    } catch {
      setConfirmando(false)
      push({ tipo: 'erro', mensagem: t('restart.erro') })
    }
  }

  return (
    <>
      <div className="restartbar" role="status">
        <IconWarn width={15} height={15} />
        <span className="restartbar-title">{t('restart.titulo')}</span>
        <span className="restartbar-detail">
          {motivos.length > 0 ? t('restart.detalheN', { n: motivos.length }) : t('restart.detalhe')}
        </span>
        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setConfirmando(true)}>
          {t('restart.agora')}
        </Button>
        <Button variant="ghost" size="sm" onClick={limpar}>
          {t('restart.depois')}
        </Button>
      </div>

      {confirmando && (
        <Modal open danger title={t('restart.modalTitulo')} onClose={() => setConfirmando(false)}>
          <p className="text-sm leading-relaxed text-ink-2">{t('restart.modalCorpo')}</p>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold tracking-[0.1em] text-ink-3">{t('restart.segure')}</span>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => setConfirmando(false)}>
                {t('restart.cancelar')}
              </Button>
              <HoldButton variant="danger" onConfirm={() => void reiniciar()}>
                {t('restart.agora')}
              </HoldButton>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
