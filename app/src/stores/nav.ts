import { create } from 'zustand'

export type ScreenId =
  | 'cockpit'
  | 'fpsboost'
  | 'xray'
  | 'memory'
  | 'cleanup'
  | 'windows'
  | 'games'
  | 'sounds'
  | 'tweaks'
  | 'runtimes'
  | 'startup'
  | 'latency'
  | 'bottleneck'
  | 'stop'
  | 'settings'
  | 'log'

interface NavState {
  screen: ScreenId
  /** muda a cada navegação — chave do wipe diagonal */
  wipeKey: number
  /** âncora opcional dentro da tela (ex.: componente do raio-x) */
  anchor: string | null
  go: (screen: ScreenId, anchor?: string) => void
}

export const useNav = create<NavState>((set, get) => ({
  screen: 'cockpit',
  wipeKey: 0,
  anchor: null,
  go: (screen, anchor) => {
    if (get().screen === screen && !anchor) return
    set((s) => ({ screen, anchor: anchor ?? null, wipeKey: s.wipeKey + 1 }))
  },
}))
