import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RestartState {
  /** algum ajuste aplicado só passa a valer depois de reiniciar o Windows */
  pendente: boolean
  /** ids de i18n dos ajustes que pediram reinício, sem repetir */
  motivos: string[]
  marcar: (motivo?: string) => void
  limpar: () => void
}

/**
 * Reinício pendente sobrevive a fechar o app: o Windows não reiniciou, então
 * o aviso tem que estar lá quando o usuário abrir de novo.
 */
export const useRestartStore = create<RestartState>()(
  persist(
    (set) => ({
      pendente: false,
      motivos: [],
      marcar: (motivo) =>
        set((s) => ({
          pendente: true,
          motivos: motivo && !s.motivos.includes(motivo) ? [...s.motivos, motivo] : s.motivos,
        })),
      limpar: () => set({ pendente: false, motivos: [] }),
    }),
    { name: 'plfcore-restart' },
  ),
)
