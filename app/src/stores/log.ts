import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OperationLog } from '../types'
import { getAdapter, isTauriEnv } from '../services/adapter'

// Callbacks de reversão vivem fora do state persistido (função não sobrevive a JSON).
const revertFns = new Map<string, () => void | Promise<void>>()
const NATIVE_OPT_MODULES = new Set(['windows', 'latency', 'bottleneck', 'level'])

export function registerRevert(id: string, fn: () => void | Promise<void>): void {
  revertFns.set(id, fn)
}

type NovoLog = Omit<OperationLog, 'id' | 'timestampIso' | 'revertido'>

interface LogState {
  logs: OperationLog[]
  log: (entry: NovoLog) => string
  markReverted: (id: string) => void
  /** Executa o callback registrado, marca revertido e loga a reversão. false = sem callback. */
  revert: (id: string) => Promise<boolean>
  exportText: () => string
}

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      logs: [],

      log: (entry) => {
        const id = crypto.randomUUID()
        const registro: OperationLog = {
          ...entry,
          id,
          timestampIso: new Date().toISOString(),
          revertido: false,
        }
        // cap de 500 registros pra não estourar o localStorage
        set((s) => ({ logs: [...s.logs, registro].slice(-500) }))
        return id
      },

      markReverted: (id) =>
        set((s) => ({
          logs: s.logs.map((l) => (l.id === id ? { ...l, revertido: true } : l)),
        })),

      revert: async (id) => {
        const original = get().logs.find((l) => l.id === id)
        if (!original || original.revertido) return false
        const nativeGlobal =
          NATIVE_OPT_MODULES.has(original.moduloId) && original.detalhes.startsWith('[measured]')
        try {
          const fn = revertFns.get(id)
          if (fn) {
            await fn()
          } else if (nativeGlobal) {
            if (!isTauriEnv()) return false
            const result = await getAdapter().revertOptimization()
            if (result.origin !== 'measured') return false
          } else {
            return false
          }
        } catch {
          return false
        }
        revertFns.delete(id)
        if (nativeGlobal) {
          set((s) => ({
            logs: s.logs.map((l) =>
              NATIVE_OPT_MODULES.has(l.moduloId) && l.detalhes.startsWith('[measured]')
                ? { ...l, revertido: true }
                : l,
            ),
          }))
          const { useLevelStore } = await import('./level')
          useLevelStore.getState().markStock()
        } else {
          get().markReverted(id)
        }
        get().log({
          moduloId: original.moduloId,
          acao: 'reverter',
          resultado: 'ok',
          reversivel: false,
          detalhes: original.acao,
        })
        return true
      },

      exportText: () =>
        get()
          .logs.map((l) => `${l.timestampIso}  ${l.moduloId}  ${l.acao}  ${l.resultado}`)
          .join('\n'),
    }),
    {
      name: 'plfcore-operations',
      partialize: (s) => ({ logs: s.logs }),
    },
  ),
)

export const selectLogsPorModulo = (moduloId: string) => (s: LogState): OperationLog[] =>
  s.logs.filter((l) => l.moduloId === moduloId)
