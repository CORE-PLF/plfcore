import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings } from '../types'

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      iniciarComWindows: false,
      minimizarBandeja: true,
      intensidadeAnimacao: 'total',
      somAtivo: true,
      somVolume: 0.2,
      notificacoes: true,
      // No Tauri, a fonte padrão é REAL. Fora dele, adapter.ts sempre seleciona
      // o mock e mantém o selo DEMO, independentemente desta preferência.
      modoDemo: false,
      confirmarAntesLimpar: true,
      pontoRestauracaoPadrao: true,
      dadosAvancados: false,
      atalhoModoPartida: 'Ctrl+Shift+F9',
      update: (patch) => {
        // trocar REAL⇄DEMO muda a fonte de TODOS os dados: o inventário em cache
        // (pré-carregado na ignição) precisa morrer, e as telas montadas recarregam.
        const trocouFonte = patch.modoDemo !== undefined && patch.modoDemo !== get().modoDemo
        set(patch)
        if (trocouFonte) {
          void import('../services/inventoryCache').then((m) => {
            m.invalidateInventory()
            if (typeof location !== 'undefined') location.reload()
          })
        }
      },
    }),
    { name: 'resync-settings' },
  ),
)
