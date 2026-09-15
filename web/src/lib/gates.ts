import { db } from './db'

// Portões operacionais administráveis sem deploy (Setting). Ausência de linha
// = operação normal: manutenção desligada, checkout e ativações ligados.

export interface OperationalGates {
  maintenanceMode: boolean
  checkoutEnabled: boolean
  activationEnabled: boolean
  minDesktopVersion: string
  supportUrl: string
}

const KEYS = [
  'maintenance_mode',
  'checkout_enabled',
  'activation_enabled',
  'min_desktop_version',
  'support_url',
]

export async function getGates(): Promise<OperationalGates> {
  const rows = await db.setting.findMany({ where: { key: { in: KEYS } } })
  const m = new Map(rows.map((r) => [r.key, r.value]))
  const s = (k: string) => (typeof m.get(k) === 'string' ? (m.get(k) as string) : '')
  return {
    maintenanceMode: m.get('maintenance_mode') === true,
    checkoutEnabled: m.get('checkout_enabled') !== false,
    activationEnabled: m.get('activation_enabled') !== false,
    minDesktopVersion: s('min_desktop_version'),
    supportUrl: s('support_url'),
  }
}
