import type { HardwareInventory, MachineRecord } from '../types'
import { getAdapter } from './adapter'
import { invalidateScan } from './scanCache'

// Cache de sessão: a ignição pré-carrega; as telas leem sem repetir a coleta.
// Falha NÃO fica em cache — o próximo acesso tenta de novo.
let inv: Promise<HardwareInventory> | null = null
let rec: Promise<MachineRecord> | null = null

export function getInventoryCached(): Promise<HardwareInventory> {
  inv ??= getAdapter()
    .getInventory()
    .catch((e: unknown) => {
      inv = null
      throw e
    })
  return inv
}

export function getMachineRecordCached(): Promise<MachineRecord> {
  rec ??= getAdapter()
    .getMachineRecord()
    .catch((e: unknown) => {
      rec = null
      throw e
    })
  return rec
}

/** Fonte de dados mudou: morre tudo — inventário, registro e os scans das telas. */
export function invalidateInventory(): void {
  inv = null
  rec = null
  invalidateScan()
}
