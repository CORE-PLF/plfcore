import { create } from 'zustand'
import type { JobState, SystemJob } from '../types'

const TERMINAIS: ReadonlySet<JobState> = new Set(['success', 'warning', 'error', 'cancelled'])

export const isTerminal = (s: JobState): boolean => TERMINAIS.has(s)

interface StartJobInit {
  moduloId: string
  tituloKey: string
  etapas?: string[]
  cancelavel?: boolean
}

interface JobsState {
  jobs: SystemJob[]
  startJob: (init: StartJobInit) => string
  updateJob: (id: string, patch: Partial<Omit<SystemJob, 'id'>>) => void
  advanceState: (id: string, state: JobState, etapaKey?: string) => void
  finishJob: (id: string, resultado: string, state?: 'success' | 'warning') => void
  failJob: (id: string, erro: string) => void
  cancelJob: (id: string) => void
}

// Invariante: job terminal NUNCA fica com progresso vivo.
function fecharJob(job: SystemJob, patch: Partial<SystemJob>): SystemJob {
  return {
    ...job,
    ...patch,
    etapaKey: null,
    progressoPct: null,
    duracaoMs: Date.now() - job.inicioMs,
  }
}

function patchJob(jobs: SystemJob[], id: string, fn: (j: SystemJob) => SystemJob): SystemJob[] {
  return jobs.map((j) => (j.id === id ? fn(j) : j))
}

// Mantém ativos + últimos 50 terminais (histórico).
function podar(jobs: SystemJob[]): SystemJob[] {
  const terminais = jobs.filter((j) => isTerminal(j.state))
  const excesso = terminais.length - 50
  if (excesso <= 0) return jobs
  const remover = new Set(terminais.slice(0, excesso).map((j) => j.id))
  return jobs.filter((j) => !remover.has(j.id))
}

export const useJobsStore = create<JobsState>()((set) => ({
  jobs: [],

  startJob: ({ moduloId, tituloKey, etapas, cancelavel = false }) => {
    const id = crypto.randomUUID()
    const job: SystemJob = {
      id,
      moduloId,
      tituloKey,
      state: 'preparing',
      etapaKey: etapas?.[0] ?? null,
      progressoPct: null,
      inicioMs: Date.now(),
      duracaoMs: null,
      cancelavel,
      resultado: null,
      erro: null,
    }
    set((s) => ({ jobs: [...s.jobs, job] }))
    return id
  },

  updateJob: (id, patch) =>
    set((s) => ({ jobs: patchJob(s.jobs, id, (j) => ({ ...j, ...patch })) })),

  advanceState: (id, state, etapaKey) =>
    set((s) => ({
      jobs: patchJob(s.jobs, id, (j) =>
        isTerminal(state)
          ? fecharJob(j, { state })
          : { ...j, state, etapaKey: etapaKey ?? j.etapaKey },
      ),
    })),

  finishJob: (id, resultado, state = 'success') =>
    set((s) => ({
      jobs: podar(patchJob(s.jobs, id, (j) => fecharJob(j, { state, resultado }))),
    })),

  failJob: (id, erro) =>
    set((s) => ({
      jobs: podar(patchJob(s.jobs, id, (j) => fecharJob(j, { state: 'error', erro }))),
    })),

  cancelJob: (id) =>
    set((s) => ({
      jobs: podar(
        patchJob(s.jobs, id, (j) =>
          j.cancelavel && !isTerminal(j.state) ? fecharJob(j, { state: 'cancelled' }) : j,
        ),
      ),
    })),
}))

export const selectJobAtivo = (s: JobsState): SystemJob | undefined =>
  s.jobs.find((j) => !isTerminal(j.state))

export const selectFila = (s: JobsState): SystemJob[] =>
  s.jobs.filter((j) => !isTerminal(j.state)).slice(1)

export const selectHistorico = (s: JobsState): SystemJob[] =>
  s.jobs.filter((j) => isTerminal(j.state)).slice(-50).reverse()
