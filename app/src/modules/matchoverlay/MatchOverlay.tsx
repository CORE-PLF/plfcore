import { useEffect, useState } from 'react'
import { defineDict, useT } from '../../i18n'
import { kitDict } from '../../components/i18n'
import type { SystemMetrics } from '../../types'
import { getAdapter, isTauriEnv } from '../../services/adapter'
import { useJobsStore, isTerminal } from '../../stores/jobs'
import { useToastsStore } from '../../stores/toasts'
import { useSettingsStore } from '../../stores/settings'
import { Surface } from '../../components/Surface'
import { EstimatedTag } from '../../components/Tag'
import { IconX } from '../../components/icons'
import { sfx } from '../../services/sfx'

const dict = defineDict({
  pt: {
    titulo: 'MODO PARTIDA',
    fps: 'FPS',
    ram: 'RAM',
    latencia: 'LAT',
    nd: 'N/D',
    stoppar: 'STOPPAR TUDO',
    stoppado: 'OPERAÇÕES INTERROMPIDAS',
    notaWeb: 'Janela flutuante real disponível no aplicativo desktop.',
  },
  en: {
    titulo: 'MATCH MODE',
    fps: 'FPS',
    ram: 'RAM',
    latencia: 'LAT',
    nd: 'N/A',
    stoppar: 'STOP EVERYTHING',
    stoppado: 'OPERATIONS STOPPED',
    notaWeb: 'Real floating window available in the desktop app.',
  },
  es: {
    titulo: 'MODO PARTIDA',
    fps: 'FPS',
    ram: 'RAM',
    latencia: 'LAT',
    nd: 'N/D',
    stoppar: 'DETENER TODO',
    stoppado: 'OPERACIONES DETENIDAS',
    notaWeb: 'Ventana flotante real disponible en la aplicación de escritorio.',
  },
  fr: {
    titulo: 'MODE MATCH',
    fps: 'FPS',
    ram: 'RAM',
    latencia: 'LAT',
    nd: 'N/D',
    stoppar: 'TOUT ARRÊTER',
    stoppado: 'OPÉRATIONS ARRÊTÉES',
    notaWeb: 'Vraie fenêtre flottante disponible dans l’application de bureau.',
  },
  it: {
    titulo: 'MODALITÀ PARTITA',
    fps: 'FPS',
    ram: 'RAM',
    latencia: 'LAT',
    nd: 'N/D',
    stoppar: 'FERMA TUTTO',
    stoppado: 'OPERAZIONI FERMATE',
    notaWeb: 'Vera finestra flottante disponibile nell’app desktop.',
  },
})

function comboBate(e: KeyboardEvent, combo: string): boolean {
  const partes = combo.toLowerCase().split('+')
  const tecla = partes[partes.length - 1] ?? ''
  return (
    partes.includes('ctrl') === e.ctrlKey &&
    partes.includes('shift') === e.shiftKey &&
    partes.includes('alt') === e.altKey &&
    e.key.toLowerCase() === tecla
  )
}

/**
 * MODO PARTIDA — mini-janela 280×96.
 * Na web é um widget flutuante; a fase Tauri promove para janela always-on-top real.
 */
export function MatchOverlay() {
  const t = useT(dict)
  const tk = useT(kitDict)
  const [aberto, setAberto] = useState(false)
  const [m, setM] = useState<SystemMetrics | null>(null)
  const [latMs, setLatMs] = useState<number | null>(null)
  const atalho = useSettingsStore((s) => s.atalhoModoPartida)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (comboBate(e, atalho)) {
        e.preventDefault()
        sfx.click()
        setAberto((a) => !a)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [atalho])

  useEffect(() => {
    if (!aberto) return
    const unsub = getAdapter().streamMetrics(setM, 1000)
    void getAdapter()
      .getLatencyInfo()
      .then((devices) => setLatMs(devices.find((d) => d.tipo === 'mouse')?.latenciaMs?.value ?? null))
      .catch(() => setLatMs(null))
    return unsub
  }, [aberto])

  if (!aberto) return null

  const stopparTudo = () => {
    const jobs = useJobsStore.getState()
    let n = 0
    for (const j of jobs.jobs) {
      if (!isTerminal(j.state) && j.cancelavel) {
        jobs.cancelJob(j.id)
        n += 1
      }
    }
    useToastsStore.getState().push({ tipo: n > 0 ? 'aviso' : 'info', mensagem: `${t('stoppado')} ▸ ${n}` })
  }

  return (
    <div className="fixed bottom-8 right-8 z-[180]" style={{ width: 280 }} role="complementary" aria-label={t('titulo')}>
      <Surface cut={6} edge="var(--color-rust)" style={{ height: 96 }}>
        <div className="flex h-full flex-col justify-between p-2.5">
          <div className="flex items-center justify-between">
            <span className="type-kicker">{t('titulo')}</span>
            <div className="flex items-center gap-2">
              {!isTauriEnv() && <span className="type-mono text-[8px] text-ink-4" title={t('notaWeb')}>WEB</span>}
              <button aria-label={tk('fechar')} className="text-ink-4 hover:text-ink-1" onClick={() => setAberto(false)}>
                <IconX width={11} height={11} />
              </button>
            </div>
          </div>
          <div className="type-mono flex items-baseline gap-4 text-[13px] font-bold text-ink-1">
            <span title={tk('naoDisponivel')}>
              <span className="text-ink-4">{t('fps')} </span>
              {t('nd')}
            </span>
            <span>
              <span className="text-ink-4">{t('ram')} </span>
              {m ? `${m.ramUsedGb.toFixed(1)}G` : '…'}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-ink-4">{t('latencia')} </span>
              {latMs !== null ? `${latMs.toFixed(1)}ms` : t('nd')}
              {latMs !== null && <EstimatedTag />}
            </span>
          </div>
          <button
            className="hazard type-display w-full border border-rust py-1 text-sm text-signal hover:brightness-125"
            onClick={stopparTudo}
          >
            {t('stoppar')}
          </button>
        </div>
      </Surface>
    </div>
  )
}
