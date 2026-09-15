import { create } from 'zustand'
import type { KillFeedEntry } from '../types'

const VISIVEIS_MAX = 5
const EXPIRA_MS = 3500

interface KillfeedState {
  /** Histórico completo (mais recente primeiro). */
  historico: KillFeedEntry[]
  /** No máximo 5 na tela; cada entrada expira em 3.5s — o componente anima a saída. */
  visiveis: KillFeedEntry[]
  push: (entry: Omit<KillFeedEntry, 'id' | 'timestamp'>) => string
}

export const useKillfeedStore = create<KillfeedState>()((set) => ({
  historico: [],
  visiveis: [],

  push: (entry) => {
    const completo: KillFeedEntry = { ...entry, id: crypto.randomUUID(), timestamp: Date.now() }
    set((s) => ({
      historico: [completo, ...s.historico].slice(0, 200),
      visiveis: [...s.visiveis, completo].slice(-VISIVEIS_MAX),
    }))
    setTimeout(() => {
      set((s) => ({ visiveis: s.visiveis.filter((v) => v.id !== completo.id) }))
    }, EXPIRA_MS)
    return completo.id
  },
}))
