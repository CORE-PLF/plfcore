import { useSettingsStore } from '../stores/settings'
import { MockSystemAdapter } from './MockSystemAdapter'
import { NativeWindowsAdapter, isTauriRuntime } from './NativeWindowsAdapter'
import type { SystemAdapter } from './SystemAdapter'

const mock = new MockSystemAdapter()
const native = new NativeWindowsAdapter()

export function isTauriEnv(): boolean {
  return isTauriRuntime()
}

// No desktop os dados são sempre os da máquina do usuário. Preferência de
// demonstração salva por uma versão anterior morre aqui, sem passar pela UI.
if (isTauriRuntime()) useSettingsStore.setState({ modoDemo: false })

/** Nativo só quando roda no Tauri E o modo demo está desligado; senão, demo. */
export function getAdapter(): SystemAdapter {
  return isTauriEnv() && !useSettingsStore.getState().modoDemo ? native : mock
}
