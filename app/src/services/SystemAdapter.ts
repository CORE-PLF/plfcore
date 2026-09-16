import type {
  BottleneckResult,
  CleanupCategory,
  CleanupCategoryId,
  DataOrigin,
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
  FpsBoostState,
  StartupEntry,
  SystemMetrics,
  RuntimeInstall,
  RuntimeScan,
  TweakScan,
  TweakState,
} from '../types'

/** O que o adapter consegue fazer DE VERDADE. Flag false = a UI sinaliza demo/indisponível. */
export interface AdapterCapabilities {
  metricsAoVivo: boolean
  smart: boolean
  sensoresTemp: boolean
  limpezaReal: boolean
  killReal: boolean
  tweaksReais: boolean
  debloatReal: boolean
}

export type Unsubscribe = () => void

/** Progresso 0..100; etapaId é um id estável (a tela traduz), null quando não há etapa. */
export type ProgressCallback = (pct: number, etapaId: string | null) => void

export interface CleanupItemEntry {
  categoriaId: CleanupCategoryId
  caminho: string
  bytes: number
}

export interface CleanupResult {
  bytesLiberados: number
  arquivosRemovidos: number
  duracaoMs: number
  origin: DataOrigin
}

export interface OptimizationResult {
  profileId: string
  alteracoesIds: string[]
  powerPlan?: string | null
  performanceVerified?: boolean
  restartRecommended?: boolean
  origin: DataOrigin
}

export interface DebloatScanItem {
  id: string
  installed: boolean
}

export interface DebloatItemResult {
  id: string
  status: 'removed' | 'not-installed' | 'failed'
  errorCode?: string | null
}

export interface DebloatResult {
  restorePointCreated: boolean
  restorePointMessage?: string | null
  items: DebloatItemResult[]
  removed: number
  failed: number
  origin: DataOrigin
}

/**
 * Fonte única de dados do sistema. A UI NUNCA inventa número: tudo passa por aqui,
 * e tudo que sai carrega DataOrigin. Implementações: MockSystemAdapter (demo) e
 * NativeWindowsAdapter (Tauri/Rust).
 */
export interface SystemAdapter {
  getCapabilities(): Promise<AdapterCapabilities>

  /**
   * Inventário completo de hardware.
   * Fontes reais no Windows:
   * - CPU: `Win32_Processor` (nome, núcleos, threads, clocks, caches, soquete)
   * - Placa-mãe: `Win32_BaseBoard` (fabricante, modelo, serial) + `Win32_BIOS`
   *   (versão, data) + firmware UEFI/Secure Boot via registro `SecureBoot\State`
   * - Memória: `Win32_PhysicalMemory` (sticks, part number, velocidade, slots)
   * - GPU: `Win32_VideoController` (nome, VRAM, driver, resolução, taxa)
   * - Discos: `Win32_DiskDrive` + `MSFT_PhysicalDisk`/`StorageReliabilityCounter`
   *   (SMART: horas ligadas, ciclos, TBW, temperatura) + `Win32_LogicalDisk` (uso/partições)
   * - Rede: `Win32_NetworkAdapterConfiguration` (IP, gateway, MAC, DHCP)
   * - Monitores: `WmiMonitorID` (root\wmi) + `Win32_VideoController` (modo ativo)
   * - Áudio: `Win32_SoundDevice`
   * - Energia: `powercfg /getactivescheme` + `Win32_Battery`
   * - SO: `Win32_OperatingSystem` (edição, build, data de instalação, uptime)
   * Campo sem fonte → null (UI exibe NÃO DISPONÍVEL).
   */
  getInventory(): Promise<HardwareInventory>

  /**
   * Registro da máquina (hostname, tempo em serviço, assinatura de hardware).
   * Fontes reais: `Win32_ComputerSystem` (hostname), `Win32_OperatingSystem.InstallDate`,
   * `Win32_BIOS.SerialNumber`; horas de operação derivadas de SMART (PowerOnHours).
   * Assinatura = hash curto do conjunto de hardware.
   */
  getMachineRecord(): Promise<MachineRecord>

  /**
   * Telemetria contínua. Retorna unsubscribe (síncrono, para cleanup de useEffect).
   * Fontes reais: contadores de performance (PDH — `Win32_PerfFormattedData_PerfOS_Processor`,
   * `_Memory`), GPU via DXGI/NVML, temperaturas via sensores do fabricante
   * (`MSAcpi_ThermalZoneTemperature` quando exposto). Sem sensor → tempC null.
   */
  streamMetrics(cb: (m: SystemMetrics) => void, intervalMs?: number): Unsubscribe

  /**
   * Varredura de limpeza — só mede, não apaga nada.
   * Fontes reais: %TEMP%, C:\Windows\Temp, caches de apps/navegadores,
   * `SHQueryRecycleBin` (lixeira), C:\ProgramData\Microsoft\Windows\WER (relatórios de erro).
   */
  scanCleanup(): Promise<CleanupCategory[]>

  /**
   * Executa a limpeza das categorias selecionadas. Emite progresso por etapa e
   * cada item removido via onItem (alimenta o kill feed).
   * Fonte real: remoção de arquivos via APIs Win32 + `SHEmptyRecycleBin`.
   */
  executeCleanup(
    ids: CleanupCategoryId[],
    onProgress: ProgressCallback,
    onItem?: (entry: CleanupItemEntry) => void,
  ): Promise<CleanupResult>

  /**
   * Processos em segundo plano candidatos a encerramento.
   * Fonte real: `Win32_Process` / `NtQuerySystemInformation` (working set).
   */
  listProcesses(): Promise<ProcessInfo[]>

  /** Varre somente a allowlist fixa de aplicativos opcionais do Windows. */
  scanDebloat(): Promise<DebloatScanItem[]>

  /**
   * Remove itens previamente validados pela allowlist nativa. Tenta criar um ponto
   * de restauração antes e informa progresso apenas após cada item terminar.
   */
  executeDebloat(ids: string[], onProgress: ProgressCallback): Promise<DebloatResult>

  /**
   * Encerra um processo e devolve o registro do que foi encerrado.
   * Fonte real: `OpenProcess` + `TerminateProcess`.
   */
  killProcess(pid: number): Promise<ProcessInfo>

  /**
   * Dispositivos de entrada e latência. Taxa de polling via Raw Input;
   * latência é derivada (sempre origin 'estimated' no adapter nativo).
   */
  getLatencyInfo(): Promise<LatencyDevice[]>

  /**
   * Estima o gargalo CPU/GPU a partir da série de métricas coletada durante a medição.
   * É estimativa por definição — origin nunca é 'measured'. Com a máquina ociosa a
   * diferença CPU/GPU é ruído: nesse caso pctEstimado volta null em vez de um número.
   */
  measureBottleneck(onProgress: ProgressCallback): Promise<BottleneckResult>

  /** Jogos suportados: caminho instalado, cache acumulado e ajustes já aplicados. */
  scanGames(): Promise<GameTarget[]>

  /** Apaga o cache do jogo (shaders, cache de servidor). Recusa com o jogo aberto. */
  cleanGameCache(id: GameTarget['id']): Promise<GameCacheResult>

  /** Config gráfica em disco dos jogos com arquivo e range confirmados. */
  scanGameConfigs(): Promise<GameConfigItem[]>

  /**
   * Escreve o preset no arquivo do jogo. Faz backup byte-a-byte antes e recusa
   * com o jogo aberto. Só toca chave que já existe, só com valor da UI oficial.
   */
  applyGameConfig(id: GameConfigId, preset: GameConfigPreset): Promise<GameConfigApplyResult>

  /** Devolve o arquivo original salvo no primeiro APLICAR. */
  restoreGameConfig(id: GameConfigId): Promise<GameConfigRestoreResult>

  /** Diagnóstico do cliente FiveM: caches medidos, canal e pastas de mod. */
  scanFivem(): Promise<FiveMScan>

  /** Esvazia os caches do FiveM. Recusa com o cliente aberto. */
  cleanFivemCache(): Promise<FiveMCleanResult>

  /** Move o conteúdo de mods/plugins/addons para backup datado. Nunca apaga. */
  isolateFivemFolder(pasta: FiveMFolder): Promise<FiveMIsolateResult>

  /** Estado medido do instalador de som: GTA encontrado, geração, backup e biblioteca de packs. */
  scanSounds(): Promise<SoundsScan>

  /** Troca os .rpf de áudio pelo pack. Faz backup do original na primeira vez e recusa com o jogo aberto. */
  installSoundPack(id: string): Promise<SoundInstallResult>

  /** Devolve o áudio original guardado no backup. */
  restoreSounds(): Promise<SoundRestoreResult>

  /** Toca a amostra do pack fora do jogo. Não toca em arquivo do GTA. */
  previewSoundPack(id: string): Promise<void>

  /**
   * Catálogo remoto de packs de som. Buscado pelo nativo (o bucket não manda CORS
   * e o fetch da webview seria bloqueado). Erro é código: ERR_MANIFEST*.
   */
  fetchCatalog(): Promise<SoundCatalogPack[]>

  /** Baixa o pack pra biblioteca local, conferindo sha256 por arquivo. Erro: ERR_DOWNLOAD*, ERR_SHA, ERR_CACHE_*. */
  downloadPack(pack: SoundCatalogPack, onProgress: (p: SoundPackProgress) => void): Promise<void>

  /** Apaga o pack da biblioteca local e libera o espaço. Não toca em arquivo do GTA. */
  removePack(slug: string): Promise<void>

  /**
   * Programas que abrem com o Windows, com estado real (mesma fonte do Gerenciador
   * de Tarefas: chaves Run + pastas de inicialização + StartupApproved).
   */
  scanStartup(): Promise<StartupEntry[]>

  /** Ativa/desativa uma entrada de inicialização. Reversível — nada é apagado. */
  toggleStartup(id: string, ativar: boolean): Promise<StartupEntry['ativado']>

  /** Estado real de cada ajuste do hub, lido do registro/serviços. */
  scanTweaks(): Promise<TweakScan>

  /** Liga/desliga um ajuste individual. Baseline salvo no primeiro liga. */
  setTweak(id: string, ligar: boolean): Promise<TweakState['ligado']>

  /**
   * Estado real de cada pacote do FPS BOOSTER, lido do registro, dos serviços e
   * do plano de energia ativo. Traz o contexto medido que decide disponibilidade
   * (RAM total e se o disco do sistema é sólido).
   */
  scanFpsBoost(): Promise<FpsBoostScan>

  /** Liga/desliga um pacote do FPS BOOSTER. Baseline salvo no primeiro liga. */
  setFpsBoost(id: string, ligar: boolean): Promise<FpsBoostState['ligado']>

  /** Runtimes de jogo: detecta pelo registro/disco, instala só via winget. */
  scanRuntimes(): Promise<RuntimeScan>

  installRuntime(id: string): Promise<RuntimeInstall>

  /** Grava o log em disco e devolve o caminho absoluto do arquivo. */
  exportLogFile(nome: string, conteudo: string): Promise<string>

  /**
   * Aplica um perfil de otimização (plano de energia, serviços, registro).
   * Fonte real: `powercfg`, SCM (serviços) e chaves de registro documentadas.
   * Toda alteração retornada em alteracoesIds para registro no log.
   */
  applyOptimization(profileId: string, onProgress: ProgressCallback): Promise<OptimizationResult>

  /** Restaura o baseline persistido pelo último conjunto de ajustes reais. */
  revertOptimization(): Promise<OptimizationResult>
}
