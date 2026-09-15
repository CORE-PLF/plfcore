import { useCallback } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Locale = 'pt' | 'en' | 'es' | 'fr' | 'it'

export const LOCALES: ReadonlyArray<{ id: Locale; label: string }> = [
  { id: 'pt', label: 'Português (BR)' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'it', label: 'Italiano' },
]

export type Dict<K extends string> = Record<Locale, Record<K, string>>

// Compile-time: os 5 idiomas são obrigados a ter exatamente as mesmas chaves.
export function defineDict<K extends string>(dict: Dict<K>): Dict<K> {
  return dict
}

interface LocaleState {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'pt',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'resync-locale' },
  ),
)

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  let out = s
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

/** Hook de tradução por módulo: const t = useT(dict); t('title') */
export function useT<K extends string>(dict: Dict<K>) {
  const locale = useLocaleStore((s) => s.locale)
  return useCallback(
    (key: K, vars?: Record<string, string | number>) => interpolate(dict[locale][key], vars),
    [dict, locale],
  )
}

/** Acesso fora de componente React (services, toasts). */
export function t<K extends string>(dict: Dict<K>, key: K, vars?: Record<string, string | number>): string {
  return interpolate(dict[useLocaleStore.getState().locale][key], vars)
}
