import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LevelChange, ReadinessLevel } from '../types'
import { getAdapter } from '../services/adapter'
import { registerRevert, useLogStore } from './log'
import { useJobsStore } from './jobs'
import type { ProgressCallback } from '../services/SystemAdapter'

/** Níveis 2 e 1 mexem fundo no sistema — exigem o fluxo ARMAR + hold-to-confirm. */
export const LEVEL_META: Record<ReadinessLevel, { exigeArmamento: boolean }> = {
  5: { exigeArmamento: false },
  4: { exigeArmamento: false },
  3: { exigeArmamento: false },
  2: { exigeArmamento: true },
  1: { exigeArmamento: true },
}

// Ids descritivos; as strings ficam no i18n das telas (descricaoKey).
const MUDANCAS_BASE: Record<ReadinessLevel, ReadonlyArray<Omit<LevelChange, 'aplicado'>>> = {
  5: [
    { moduleId: 'energia', descricaoKey: 'level.l5.energiaEquilibrado' },
    { moduleId: 'visual', descricaoKey: 'level.l5.efeitosPadrao' },
    { moduleId: 'servicos', descricaoKey: 'level.l5.servicosPadrao' },
  ],
  4: [
    { moduleId: 'energia', descricaoKey: 'level.l4.energiaAlto' },
  ],
  3: [
    { moduleId: 'energia', descricaoKey: 'level.l3.energiaAlto' },
    { moduleId: 'inicializacao', descricaoKey: 'level.l3.inicializacaoPesada' },
  ],
  2: [
    { moduleId: 'processos', descricaoKey: 'level.l2.processosFundo' },
    { moduleId: 'captura', descricaoKey: 'level.l2.desativarDvr' },
  ],
  1: [
    { moduleId: 'servicos', descricaoKey: 'level.l1.servicosNaoEssenciais' },
    { moduleId: 'prioridade', descricaoKey: 'level.l1.prioridadeJogo' },
    { moduleId: 'telemetria', descricaoKey: 'level.l1.telemetriaOff' },
  ],
}

function mudancasIniciais(): Record<ReadinessLevel, LevelChange[]> {
  const out = {} as Record<ReadinessLevel, LevelChange[]>
  for (const nivel of [5, 4, 3, 2, 1] as const) {
    out[nivel] = MUDANCAS_BASE[nivel].map((m) => ({ ...m, aplicado: nivel === 5 }))
  }
  return out
}

interface LevelState {
  atual: ReadinessLevel
  /** Nível escolhido aguardando confirmação (ARMAR nos níveis 2/1). */
  pendingLevel: ReadinessLevel | null
  mudancas: Record<ReadinessLevel, LevelChange[]>
  setPending: (n: ReadinessLevel | null) => void
  markStock: () => void
  /** Cria job, registra no log e atualiza o nível atual. Retorna o id do job. */
  applyLevel: (n: ReadinessLevel, onProgress?: ProgressCallback) => Promise<string>
}

export const useLevelStore = create<LevelState>()(persist((set, get) => ({
  atual: 5,
  pendingLevel: null,
  mudancas: mudancasIniciais(),

  setPending: (n) => set({ pendingLevel: n }),

  markStock: () => {
    const mudancas = {} as Record<ReadinessLevel, LevelChange[]>
    for (const nivel of [5, 4, 3, 2, 1] as const) {
      mudancas[nivel] = get().mudancas[nivel].map((m) => ({ ...m, aplicado: nivel === 5 }))
    }
    set({ atual: 5, pendingLevel: null, mudancas })
  },

  applyLevel: async (n, onProgress) => {
    const jobs = useJobsStore.getState()
    const adapter = getAdapter()
    const jobId = jobs.startJob({
      moduloId: 'level',
      tituloKey: 'level.job.aplicar',
      cancelavel: false,
    })
    jobs.advanceState(jobId, 'applying')

    try {
      const result = await adapter.applyOptimization(`level-${n}`, (pct, etapaId) => {
        useJobsStore.getState().updateJob(jobId, { progressoPct: pct, etapaKey: etapaId })
        onProgress?.(pct, etapaId)
      })
      const mudancas = {} as Record<ReadinessLevel, LevelChange[]>
      for (const nivel of [5, 4, 3, 2, 1] as const) {
        mudancas[nivel] = get().mudancas[nivel].map((m) => ({ ...m, aplicado: nivel === n }))
      }
      set({ atual: n, pendingLevel: null, mudancas })

      const reversivel = n !== 5
      const logId = useLogStore.getState().log({
        moduloId: 'level',
        acao: `aplicar-nivel-${n}`,
        resultado: 'ok',
        reversivel,
        detalhes: `[${result.origin}] ${result.alteracoesIds.join(',')}`,
      })
      if (reversivel) {
        registerRevert(logId, async () => {
          await adapter.revertOptimization()
          get().markStock()
        })
      }
      jobs.finishJob(jobId, `nivel-${n}`)
      return jobId
    } catch (error) {
      jobs.failJob(jobId, 'level-apply-failed')
      throw error
    }
  },
}), {
  name: 'plfcore-level',
  partialize: (state) => ({ atual: state.atual, mudancas: state.mudancas }),
}))
