// Marca centralizada — trocar o nome do produto = editar só este arquivo.
export const BRAND = {
  name: 'RESYNC',
  shortName: 'RESYNC',
  version: '1.9.0',
  revision: 'REV A',
  /// exibido na sidebar: RESYNC v1.8.0 // REV A — manter em sincronia com package.json e tauri.conf.json
  get versionLine() {
    return `${this.name} v${this.version} // ${this.revision}`
  },
} as const
