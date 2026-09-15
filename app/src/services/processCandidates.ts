import type { ProcessInfo } from '../types'

export type ProcessKind = 'recommended' | 'attention' | 'optional'

export interface ProcessMeta {
  kind: ProcessKind
  reasonKey: 'procReasonBackground' | 'procReasonAttention' | 'procReasonOptional'
}

const RECOMMENDED = [
  'discord', 'spotify', 'teams', 'slack', 'whatsapp', 'onedrive', 'dropbox',
  'ccxprocess', 'creative cloud', 'adobeupdater', 'phoneexperiencehost', 'widgets',
  'gamebar', 'epicgameslauncher', 'battle.net', 'steamwebhelper',
  'riotclientservices', 'chrome_updater',
]

const ATTENTION = [
  'chrome', 'msedge', 'firefox', 'opera', 'brave', 'code.exe', 'devenv',
  'winword', 'excel', 'powerpnt', 'notepad', 'docker', 'obs', 'photoshop',
  'illustrator', 'afterfx', 'premiere', 'heidisql',
]

export function processMeta(nome: string): ProcessMeta {
  const normalized = nome.toLowerCase()
  if (RECOMMENDED.some((candidate) => normalized.includes(candidate))) {
    return { kind: 'recommended', reasonKey: 'procReasonBackground' }
  }
  if (ATTENTION.some((candidate) => normalized.includes(candidate))) {
    return { kind: 'attention', reasonKey: 'procReasonAttention' }
  }
  return { kind: 'optional', reasonKey: 'procReasonOptional' }
}

export function processKey(process: ProcessInfo): string {
  return process.nome.toLowerCase()
}

/** Aplicativos apropriados para a preparação do L1; processos do sistema já são barrados no backend. */
export function levelOneCandidates(processes: ProcessInfo[]): ProcessInfo[] {
  return processes
    .filter((process) => processMeta(process.nome).kind !== 'optional')
    .sort((a, b) => {
      const aRank = processMeta(a.nome).kind === 'recommended' ? 0 : 1
      const bRank = processMeta(b.nome).kind === 'recommended' ? 0 : 1
      return aRank - bRank || b.ramMb - a.ramMb
    })
    .slice(0, 12)
}

export function recommendedProcessKeys(processes: ProcessInfo[]): Set<string> {
  return new Set(processes
    .filter((process) => processMeta(process.nome).kind === 'recommended')
    .map(processKey))
}

export function formatRamMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}
