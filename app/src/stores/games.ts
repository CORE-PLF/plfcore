import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameProfile, ReadinessLevel } from '../types'

interface GamesState {
  profiles: GameProfile[]
  /** jogo detectado agora (processo) e nível vigente antes da detecção, p/ restaurar */
  activeGame: string | null
  previousLevel: ReadinessLevel | null
  upsert: (p: GameProfile) => void
  remove: (processo: string) => void
  setActive: (processo: string | null, previousLevel?: ReadinessLevel | null) => void
}

const DEFAULTS: GameProfile[] = [
  { processo: 'FiveM.exe', nomeJogo: 'FiveM', levelAoDetectar: 2 },
  { processo: 'GTA5.exe', nomeJogo: 'GTA V', levelAoDetectar: 2 },
  { processo: 'cs2.exe', nomeJogo: 'Counter-Strike 2', levelAoDetectar: 2 },
  { processo: 'VALORANT-Win64-Shipping.exe', nomeJogo: 'Valorant', levelAoDetectar: 3 },
  { processo: 'League of Legends.exe', nomeJogo: 'League of Legends', levelAoDetectar: 3 },
  { processo: 'FortniteClient-Win64-Shipping.exe', nomeJogo: 'Fortnite', levelAoDetectar: 2 },
]

export const useGamesStore = create<GamesState>()(
  persist(
    (set) => ({
      profiles: DEFAULTS,
      activeGame: null,
      previousLevel: null,
      upsert: (p) =>
        set((s) => ({
          profiles: [...s.profiles.filter((x) => x.processo !== p.processo), p],
        })),
      remove: (processo) => set((s) => ({ profiles: s.profiles.filter((x) => x.processo !== processo) })),
      setActive: (processo, previousLevel = null) => set({ activeGame: processo, previousLevel }),
    }),
    { name: 'plfcore-games', partialize: (s) => ({ profiles: s.profiles }) as Partial<GamesState> },
  ),
)
