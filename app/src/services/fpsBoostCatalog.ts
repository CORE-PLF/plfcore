import type { FpsBoostCategoria } from '../types'

export interface FpsBoostDef {
  id: string
  categoria: FpsBoostCategoria
  /** Exige reiniciar o Windows para valer. */
  reinicio?: boolean
  /** Fica fora do TURBO: tem custo que a pessoa precisa escolher aceitar. */
  opcional?: boolean
  /** Depende de condição de hardware medida (SSD, RAM). A tela mostra o motivo. */
  condicional?: boolean
}

/**
 * Espelho visual da allowlist nativa (fpsboost.ps1). Cada id agrupa um conjunto
 * de chaves/valores com baseline salvo — ligar e desligar são o mesmo interruptor.
 * Ordem = ordem de exibição dentro do grupo.
 */
export const FPS_BOOST_CATALOG: FpsBoostDef[] = [
  // perfil multimídia e prioridade de jogo
  { id: 'mmcss-perfil-jogo', categoria: 'multimidia' },
  { id: 'mmcss-sem-lazy', categoria: 'multimidia' },

  // stack de jogos do Windows
  { id: 'game-dvr-total-off', categoria: 'jogos' },
  { id: 'game-mode-on', categoria: 'jogos' },
  { id: 'gpu-agendamento-hardware', categoria: 'jogos', reinicio: true },
  { id: 'gpu-preempcao-off', categoria: 'jogos', reinicio: true, opcional: true },

  // energia
  { id: 'energia-sem-throttle', categoria: 'energia' },
  { id: 'energia-sem-estimativa', categoria: 'energia' },
  { id: 'cpu-idle-off', categoria: 'energia', opcional: true },

  // memória
  { id: 'memoria-kernel-residente', categoria: 'memoria', reinicio: true },
  { id: 'svchost-agrupado', categoria: 'memoria', reinicio: true, condicional: true },
  { id: 'prefetch-superfetch-off', categoria: 'memoria', reinicio: true, opcional: true, condicional: true },

  // disco
  { id: 'disco-sem-economia', categoria: 'disco', reinicio: true },
  { id: 'disco-sem-idle-storport', categoria: 'disco', reinicio: true },

  // rede
  { id: 'rede-tcp-imediato', categoria: 'rede' },
  { id: 'medicao-rede-off', categoria: 'rede', reinicio: true },

  // entrada
  { id: 'mouse-1-para-1', categoria: 'entrada' },
  { id: 'teclado-resposta-maxima', categoria: 'entrada' },
  { id: 'acessibilidade-off', categoria: 'entrada' },
  { id: 'usb-suspensao-off', categoria: 'entrada', reinicio: true },

  // interface
  { id: 'interface-sem-espera', categoria: 'interface' },
]

/** Zona de risco: hazard + ARMAR + hold-to-confirm, nunca no TURBO. */
export const FPS_BOOST_RISCO: FpsBoostDef = {
  id: 'mitigacoes-cpu-off',
  categoria: 'risco',
  reinicio: true,
  opcional: true,
}

export const FPS_BOOST_GRUPOS: FpsBoostCategoria[] = [
  'multimidia',
  'jogos',
  'energia',
  'memoria',
  'disco',
  'rede',
  'entrada',
  'interface',
]

/** Itens do acervo original deixados de fora — a tela mostra o porquê. */
export const FPS_BOOST_FORA = [
  'bcdedit',
  'uac',
  'ifeo-sistema',
  'etw-eventlog',
  'mitigacoes-processo',
  'usb-por-dispositivo',
  'pool-memoria',
] as const

export const FPS_BOOST_BY_ID = new Map(
  [...FPS_BOOST_CATALOG, FPS_BOOST_RISCO].map((item) => [item.id, item]),
)
