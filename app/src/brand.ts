// Marca centralizada — trocar o nome do produto = editar só este arquivo.
export const BRAND = {
  name: 'PLF CORE',
  shortName: 'PLF',
  version: '1.0.1',
  revision: 'REV A',
  /// exibido na sidebar — manter em sincronia com package.json e tauri.conf.json
  get versionLine() {
    return `${this.name} v${this.version}`
  },
} as const
