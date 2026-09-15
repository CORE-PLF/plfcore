import { defineDict, t } from '../i18n'
import { useSettingsStore } from '../stores/settings'
import { useToastsStore } from '../stores/toasts'
import { useGamesStore } from '../stores/games'
import { useLevelStore } from '../stores/level'
import { useLogStore } from '../stores/log'
import { isTauriEnv } from './adapter'

const dict = defineDict({
  pt: {
    detectado: '{jogo} DETECTADO ▸ APLICAR PERFIL? (DEMO)',
    aplicar: 'APLICAR',
    aplicado: 'PERFIL {jogo} APLICADO ▸ L{nivel}',
    encerrou: '{jogo} ENCERRADO ▸ RESTAURAR ESTADO ANTERIOR? (DEMO)',
    restaurar: 'RESTAURAR',
    restaurado: 'ESTADO ANTERIOR RESTAURADO ▸ L{nivel}',
  },
  en: {
    detectado: '{jogo} DETECTED ▸ APPLY PROFILE? (DEMO)',
    aplicar: 'APPLY',
    aplicado: '{jogo} PROFILE APPLIED ▸ L{nivel}',
    encerrou: '{jogo} CLOSED ▸ RESTORE PREVIOUS STATE? (DEMO)',
    restaurar: 'RESTORE',
    restaurado: 'PREVIOUS STATE RESTORED ▸ L{nivel}',
  },
  es: {
    detectado: '{jogo} DETECTADO ▸ ¿APLICAR PERFIL? (DEMO)',
    aplicar: 'APLICAR',
    aplicado: 'PERFIL {jogo} APLICADO ▸ L{nivel}',
    encerrou: '{jogo} CERRADO ▸ ¿RESTAURAR ESTADO ANTERIOR? (DEMO)',
    restaurar: 'RESTAURAR',
    restaurado: 'ESTADO ANTERIOR RESTAURADO ▸ L{nivel}',
  },
  fr: {
    detectado: '{jogo} DÉTECTÉ ▸ APPLIQUER LE PROFIL ? (DÉMO)',
    aplicar: 'APPLIQUER',
    aplicado: 'PROFIL {jogo} APPLIQUÉ ▸ L{nivel}',
    encerrou: '{jogo} FERMÉ ▸ RESTAURER L’ÉTAT PRÉCÉDENT ? (DÉMO)',
    restaurar: 'RESTAURER',
    restaurado: 'ÉTAT PRÉCÉDENT RESTAURÉ ▸ L{nivel}',
  },
  it: {
    detectado: '{jogo} RILEVATO ▸ APPLICARE IL PROFILO? (DEMO)',
    aplicar: 'APPLICA',
    aplicado: 'PROFILO {jogo} APPLICATO ▸ L{nivel}',
    encerrou: '{jogo} CHIUSO ▸ RIPRISTINARE LO STATO PRECEDENTE? (DEMO)',
    restaurar: 'RIPRISTINA',
    restaurado: 'STATO PRECEDENTE RIPRISTINATO ▸ L{nivel}',
  },
})

const DEMO_FLAG = 'plfcore-gamesense-demo'
const DEMO_DETECT_MS = 25_000
const DEMO_CLOSE_MS = 90_000

/**
 * GAME SENSE — detecção de jogo em foco.
 * Detecção real de processo exige o app desktop (fase Tauri liga o polling nativo).
 * Em modo demo: UMA detecção demonstrativa por sessão, sempre rotulada (DEMO).
 */
export function startGameSense(): void {
  const { modoDemo, notificacoes } = useSettingsStore.getState()
  if (!notificacoes) return
  if (isTauriEnv() && !modoDemo) return // polling nativo entra na fase Tauri
  if (!modoDemo) return
  if (sessionStorage.getItem(DEMO_FLAG) === '1') return
  sessionStorage.setItem(DEMO_FLAG, '1')

  setTimeout(() => {
    const perfil = useGamesStore.getState().profiles.find((p) => p.nomeJogo === 'FiveM') ?? useGamesStore.getState().profiles[0]
    if (!perfil) return
    useToastsStore.getState().push({
      tipo: 'info',
      mensagem: t(dict, 'detectado', { jogo: perfil.nomeJogo.toUpperCase() }),
      acao: {
        labelKey: t(dict, 'aplicar'),
        run: () => {
          const nivelAnterior = useLevelStore.getState().atual
          useGamesStore.getState().setActive(perfil.processo, nivelAnterior)
          useLevelStore.getState().applyLevel(perfil.levelAoDetectar)
          useLogStore.getState().log({
            moduloId: 'gamesense',
            acao: `perfil-${perfil.nomeJogo}`,
            resultado: `L${perfil.levelAoDetectar}`,
            reversivel: false,
            detalhes: `demo; nível anterior L${nivelAnterior}`,
          })
          useToastsStore.getState().push({
            tipo: 'sucesso',
            mensagem: t(dict, 'aplicado', { jogo: perfil.nomeJogo.toUpperCase(), nivel: perfil.levelAoDetectar }),
          })
          // "fechamento" do jogo demo: oferece restaurar o estado anterior
          setTimeout(() => {
            const { previousLevel } = useGamesStore.getState()
            if (previousLevel === null) return
            useToastsStore.getState().push({
              tipo: 'info',
              mensagem: t(dict, 'encerrou', { jogo: perfil.nomeJogo.toUpperCase() }),
              acao: {
                labelKey: t(dict, 'restaurar'),
                run: () => {
                  useLevelStore.getState().applyLevel(previousLevel)
                  useGamesStore.getState().setActive(null)
                  useToastsStore.getState().push({
                    tipo: 'sucesso',
                    mensagem: t(dict, 'restaurado', { nivel: previousLevel }),
                  })
                },
              },
            })
          }, DEMO_CLOSE_MS)
        },
      },
    })
  }, DEMO_DETECT_MS)
}
