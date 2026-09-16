import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  BottleneckResult,
  CleanupCategory,
  CleanupCategoryId,
  GameCacheResult,
  GameConfigApplyResult,
  GameConfigId,
  GameConfigItem,
  GameConfigPreset,
  GameConfigRestoreResult,
  FiveMCleanResult,
  FiveMFolder,
  FiveMIsolateResult,
  FiveMScan,
  SoundCatalogPack,
  SoundInstallResult,
  SoundPackProgress,
  SoundRestoreResult,
  SoundsScan,
  GameTarget,
  HardwareInventory,
  LatencyDevice,
  MachineRecord,
  ProcessInfo,
  FpsBoostScan,
  StartupEntry,
  SystemMetrics,
  RuntimeInstall,
  RuntimeScan,
  TweakScan,
} from '../types'
import type {
  AdapterCapabilities,
  CleanupItemEntry,
  CleanupResult,
  DebloatItemResult,
  DebloatResult,
  DebloatScanItem,
  OptimizationResult,
  ProgressCallback,
  SystemAdapter,
  Unsubscribe,
} from './SystemAdapter'

/** Detecção de runtime Tauri (v2 injeta __TAURI_INTERNALS__; isTauri em builds recentes). */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('isTauri' in window || '__TAURI_INTERNALS__' in window)
}

/** Abaixo disso a máquina está parada e a diferença CPU/GPU não significa nada. */
const LOAD_FLOOR_PCT = 25

function median(values: number[]): number {
  const ordenado = [...values].sort((a, b) => a - b)
  const meio = Math.floor(ordenado.length / 2)
  return ordenado.length % 2 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2
}

interface NativeCleanupProgress {
  categoriaId: string
  bytesLiberados: number
  arquivosRemovidos: number
  concluida: boolean
}

/**
 * Adapter nativo — ponte para os comandos Rust do Tauri.
 * REAL na v1: inventário/registro (WMI via PowerShell fixo), métricas (sysinfo),
 * limpeza segura, processos, entrada, gargalo estimado e perfis reversíveis.
 * Especificações nominais recebem origin 'estimated'; registro e sensores reais, 'measured'.
 * Erros são códigos, não strings de UI: quem traduz é a tela.
 */
export class NativeWindowsAdapter implements SystemAdapter {
  private async call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!isTauriRuntime()) throw new Error('ERR_TAURI_UNAVAILABLE')
    try {
      return await invoke<T>(cmd, args)
    } catch (cause) {
      const raw = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : String(cause)
      const codes = raw.match(/ERR_[A-Z0-9_]+/g)
      const code = codes?.at(-1) ?? `ERR_NATIVE_COMMAND_FAILED:${cmd}`
      throw new Error(code, { cause })
    }
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      metricsAoVivo: true,
      smart: true,
      sensoresTemp: true,
      limpezaReal: true,
      killReal: true,
      tweaksReais: true,
      debloatReal: true,
    }
  }

  async getInventory(): Promise<HardwareInventory> {
    return this.call<HardwareInventory>('get_inventory')
  }

  async getMachineRecord(): Promise<MachineRecord> {
    return this.call<MachineRecord>('get_machine_record')
  }

  streamMetrics(cb: (m: SystemMetrics) => void, intervalMs = 1000): Unsubscribe {
    if (!isTauriRuntime()) throw new Error('ERR_TAURI_UNAVAILABLE')
    let vivo = true
    const tick = async () => {
      const m = await this.call<SystemMetrics>('get_metrics')
      if (vivo) cb(m)
    }
    void tick()
    const handle = setInterval(() => void tick(), intervalMs)
    return () => {
      vivo = false
      clearInterval(handle)
    }
  }

  async scanCleanup(): Promise<CleanupCategory[]> {
    return this.call<CleanupCategory[]>('scan_cleanup')
  }

  async executeCleanup(
    ids: CleanupCategoryId[],
    onProgress: ProgressCallback,
    onItem?: (entry: CleanupItemEntry) => void,
  ): Promise<CleanupResult> {
    const inicio = performance.now()
    let concluidas = 0
    onProgress(0, null)
    const unItem = await listen<NativeCleanupProgress>('cleanup-item', (e) => {
      concluidas += 1
      onProgress(Math.min(99, (concluidas / ids.length) * 100), e.payload.categoriaId)
      onItem?.({
        categoriaId: e.payload.categoriaId as CleanupCategoryId,
        caminho: e.payload.categoriaId,
        bytes: e.payload.bytesLiberados,
      })
    })
    const unProg = await listen<NativeCleanupProgress>('cleanup-progress', (e) => {
      onProgress(Math.min(99, ((concluidas + 0.5) / ids.length) * 100), e.payload.categoriaId)
    })
    try {
      const r = await this.call<NativeCleanupProgress>('execute_cleanup', { ids })
      onProgress(100, null)
      return {
        bytesLiberados: r.bytesLiberados,
        arquivosRemovidos: r.arquivosRemovidos,
        duracaoMs: performance.now() - inicio,
        origin: 'measured',
      }
    } finally {
      unItem()
      unProg()
    }
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    return this.call<ProcessInfo[]>('list_processes')
  }

  async scanDebloat(): Promise<DebloatScanItem[]> {
    return this.call<DebloatScanItem[]>('scan_debloat')
  }

  async executeDebloat(ids: string[], onProgress: ProgressCallback): Promise<DebloatResult> {
    onProgress(0, 'restore-point')
    let restore: { created: boolean; message?: string | null }
    try {
      restore = await this.call<{ created: boolean; message?: string | null }>('prepare_debloat_restore')
    } catch {
      restore = { created: false, message: 'RESTORE_POINT_ERROR' }
    }
    const items: DebloatItemResult[] = []
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index]
      onProgress((index / Math.max(1, ids.length)) * 100, id)
      try {
        const item = await this.call<DebloatItemResult>('remove_debloat_item', { id })
        items.push(item)
      } catch {
        items.push({ id, status: 'failed', errorCode: 'ERR_DEBLOAT_ITEM_FAILED' })
      }
      onProgress(((index + 1) / Math.max(1, ids.length)) * 100, id)
    }
    return {
      restorePointCreated: restore.created,
      restorePointMessage: restore.message ?? null,
      items,
      removed: items.filter((item) => item.status === 'removed').length,
      failed: items.filter((item) => item.status === 'failed' || item.errorCode).length,
      origin: 'measured',
    }
  }

  async killProcess(pid: number): Promise<ProcessInfo> {
    return this.call<ProcessInfo>('kill_process', { pid })
  }

  async getLatencyInfo(): Promise<LatencyDevice[]> {
    return this.call<LatencyDevice[]>('get_latency_info')
  }

  async measureBottleneck(onProgress: ProgressCallback): Promise<BottleneckResult> {
    const samples: SystemMetrics[] = []
    const total = 20
    onProgress(0, 'coleta-cpu')
    for (let i = 0; i < total; i++) {
      samples.push(await this.call<SystemMetrics>('get_metrics'))
      onProgress(Math.round(((i + 1) / total) * 85), i < total / 2 ? 'coleta-cpu' : 'coleta-gpu')
      if (i < total - 1) await new Promise<void>((resolve) => setTimeout(resolve, 300))
    }
    const gpuSamples = samples.map((m) => m.gpuUsage).filter((v): v is number => v !== null)
    if (gpuSamples.length === 0) throw new Error('ERR_BOTTLENECK_GPU_UNAVAILABLE')
    onProgress(92, 'analise')

    // Mediana, não média: um pico do navegador no meio da coleta não desloca o resultado.
    const cpu = median(samples.map((m) => m.cpuUsage))
    const gpu = median(gpuSamples)
    const cargaPico = Math.round(Math.max(cpu, gpu))
    const recomendacoesIds =
      cpu >= gpu
        ? ['encerrar-processos-fundo', 'plano-energia-alto']
        : ['reduzir-resolucao', 'atualizar-driver-gpu']
    onProgress(100, null)

    // Sem carga real a diferença CPU/GPU é ruído de segundo plano e o número muda
    // a cada medição. Nesse caso o gargalo não é medido — é declarado indisponível.
    if (cargaPico < LOAD_FLOOR_PCT) {
      return { pctEstimado: null, pctProjetado: null, origin: 'estimated', recomendacoesIds: [], cargaPico }
    }
    return {
      pctEstimado: Math.min(100, Math.round(Math.abs(cpu - gpu))),
      pctProjetado: null,
      origin: 'estimated',
      recomendacoesIds,
      cargaPico,
    }
  }

  async scanGames(): Promise<GameTarget[]> {
    return this.call<GameTarget[]>('scan_games')
  }

  async cleanGameCache(id: GameTarget['id']): Promise<GameCacheResult> {
    return this.call<GameCacheResult>('clean_game_cache', { id })
  }

  async scanGameConfigs(): Promise<GameConfigItem[]> {
    return this.call<GameConfigItem[]>('scan_game_configs')
  }

  async applyGameConfig(id: GameConfigId, preset: GameConfigPreset): Promise<GameConfigApplyResult> {
    return this.call<GameConfigApplyResult>('apply_game_config', { id, preset })
  }

  async restoreGameConfig(id: GameConfigId): Promise<GameConfigRestoreResult> {
    return this.call<GameConfigRestoreResult>('restore_game_config', { id })
  }

  async scanFivem(): Promise<FiveMScan> {
    return this.call<FiveMScan>('scan_fivem')
  }

  async cleanFivemCache(): Promise<FiveMCleanResult> {
    return this.call<FiveMCleanResult>('clean_fivem_cache')
  }

  async isolateFivemFolder(pasta: FiveMFolder): Promise<FiveMIsolateResult> {
    return this.call<FiveMIsolateResult>('isolate_fivem_folder', { pasta })
  }

  async scanSounds(): Promise<SoundsScan> {
    return this.call<SoundsScan>('scan_sounds')
  }

  async installSoundPack(id: string): Promise<SoundInstallResult> {
    return this.call<SoundInstallResult>('install_sound_pack', { id })
  }

  async restoreSounds(): Promise<SoundRestoreResult> {
    return this.call<SoundRestoreResult>('restore_sounds')
  }

  async previewSoundPack(id: string): Promise<void> {
    await this.call<null>('preview_sound_pack', { id })
  }

  async fetchCatalog(): Promise<SoundCatalogPack[]> {
    const url = import.meta.env.VITE_PLFCORE_MANIFEST
    if (!url) throw new Error('ERR_MANIFEST_NAO_CONFIGURADO')
    const bruto = await this.call<string>('manifest_baixar', { url })
    let dados: { packs?: SoundCatalogPack[] }
    try {
      dados = JSON.parse(bruto)
    } catch {
      throw new Error('ERR_MANIFEST')
    }
    if (!Array.isArray(dados.packs)) throw new Error('ERR_MANIFEST')
    return dados.packs
  }

  async downloadPack(pack: SoundCatalogPack, onProgress: (p: SoundPackProgress) => void): Promise<void> {
    const un = await listen<SoundPackProgress>('pack-progress', (e) => {
      if (e.payload.slug === pack.slug) onProgress(e.payload)
    })
    try {
      await this.call<null>('baixar_pack', {
        slug: pack.slug,
        arquivos: pack.arquivos,
        previewUrl: pack.previewUrl,
        nome: pack.nome,
      })
    } finally {
      un()
    }
  }

  async removePack(slug: string): Promise<void> {
    await this.call<null>('remover_pack', { slug })
  }

  async scanStartup(): Promise<StartupEntry[]> {
    return this.call<StartupEntry[]>('scan_startup')
  }

  async toggleStartup(id: string, ativar: boolean): Promise<boolean> {
    const r = await this.call<{ id: string; ativado: boolean }>('toggle_startup', { id, ativar })
    return r.ativado
  }

  async scanFpsBoost(): Promise<FpsBoostScan> {
    return this.call<FpsBoostScan>('scan_fpsboost')
  }

  async setFpsBoost(id: string, ligar: boolean): Promise<boolean> {
    const r = await this.call<{ id: string; ligado: boolean }>('set_fpsboost', { id, ligar })
    return r.ligado
  }

  async scanRuntimes(): Promise<RuntimeScan> {
    return this.call<RuntimeScan>('scan_runtimes')
  }

  async installRuntime(id: string): Promise<RuntimeInstall> {
    return this.call<RuntimeInstall>('install_runtime', { id })
  }

  async scanTweaks(): Promise<TweakScan> {
    return this.call<TweakScan>('scan_tweaks')
  }

  async setTweak(id: string, ligar: boolean): Promise<boolean> {
    const r = await this.call<{ id: string; ligado: boolean }>('set_tweak', { id, ligar })
    return r.ligado
  }

  async exportLogFile(nome: string, conteudo: string): Promise<string> {
    return this.call<string>('export_log_file', { nome, conteudo })
  }

  async applyOptimization(profileId: string, onProgress: ProgressCallback): Promise<OptimizationResult> {
    const aggressive = /^(forcado|customizado-0|level-1|boost-seguro|reduzir-gargalo)$/.test(profileId)
    const fullPipeline: Array<[number, string, number]> = [
      [4, 'inventario', 700],
      [10, 'backup', 900],
      [18, 'energia', 1000],
      [29, 'registro', 1000],
      [41, 'jogos', 900],
      [52, 'qos', 900],
      [62, 'interface', 900],
      [72, 'servicos', 1000],
      [82, 'tarefas', 1000],
      [89, 'consistencia', 900],
    ]
    const compactPipeline = fullPipeline.filter(([, id]) =>
      ['inventario', 'backup', 'energia', 'registro', 'jogos', 'consistencia'].includes(id),
    )
    const pipeline = aggressive ? fullPipeline : compactPipeline
    let result: OptimizationResult | null = null
    let failure: unknown = null
    let settled = false
    const nativeWork = this.call<OptimizationResult>('apply_optimization', { profileId })
      .then((value) => { result = value })
      .catch((error: unknown) => { failure = error })
      .finally(() => { settled = true })

    for (const [pct, stage, duration] of pipeline) {
      if (failure) throw failure
      onProgress(pct, stage)
      await new Promise<void>((resolve) => setTimeout(resolve, duration))
    }
    if (!settled) onProgress(92, 'aguardando-windows')
    await nativeWork
    if (failure) throw failure
    if (!result) throw new Error('ERR_OPT_EMPTY')
    onProgress(96, 'confirmando-energia')
    await new Promise<void>((resolve) => setTimeout(resolve, aggressive ? 1400 : 700))
    onProgress(100, null)
    return result
  }

  async revertOptimization(): Promise<OptimizationResult> {
    return this.call<OptimizationResult>('revert_optimization')
  }
}
