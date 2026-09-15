import { create } from 'zustand'

const AUTO_DISMISS_MS = 5000

export type ToastTipo = 'info' | 'sucesso' | 'erro' | 'aviso'

export interface Toast {
  id: string
  tipo: ToastTipo
  /** Mensagem já traduzida pela tela que disparou o toast. */
  mensagem: string
  acao: { labelKey: string; run: () => void } | null
}

interface ToastsState {
  toasts: Toast[]
  push: (t: { tipo: ToastTipo; mensagem: string; acao?: Toast['acao'] }) => string
  dismiss: (id: string) => void
}

export const useToastsStore = create<ToastsState>()((set) => ({
  toasts: [],

  push: ({ tipo, mensagem, acao }) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, tipo, mensagem, acao: acao ?? null }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, AUTO_DISMISS_MS)
    return id
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
