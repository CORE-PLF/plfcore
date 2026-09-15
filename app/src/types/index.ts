// Tipos de domínio do PLF CORE.
// Honestidade de dados: todo número exposto por adapter carrega DataOrigin.
// Campo de inventário sem fonte = null (a UI exibe NÃO DISPONÍVEL, nunca "UNKNOWN").

export type DataOrigin = 'measured' | 'estimated' | 'demo'

/** Wrapper para valores numéricos/resultados que precisam declarar procedência. */
export interface Sourced<T> {
  value: T
  origin: DataOrigin
}

/** Amostra de telemetria. A store de métricas mantém a série dos últimos 60s. */
export interface SystemMetrics {
  cpuUsage: number
  /** null quando não há fonte confiável (modo REAL sem hook de driver) — nunca inventado. */
  gpuUsage: number | null
  ramUsedGb: number
  ramTotalGb: number
  cpuTempC: number | null
  /** Origem específica da temperatura; null quando não existe sensor real de CPU. */
  cpuTempOrigin: DataOrigin | null
  /** Frequência média atual dos processadores lógicos, medida pelo Windows. */
  cpuClockGhz: number | null
  gpuTempC: number | null
  timestamp: number
  origin: DataOrigin
}

// ---------------------------------------------------------------------------
// Inventário de hardware
// ---------------------------------------------------------------------------

export interface CpuInfo {
  nome: string
  nucleos: number
  threads: number
  clockBaseGhz: number
  clockAtualGhz: number
  cacheL2Mb: number
  cacheL3Mb: number
  soquete: string
  tempC: number | null
  usoPct: number
}

export interface BoardInfo {
  fabricante: string | null
  modelo: string | null
  chipset: string | null
  biosVersao: string | null
  biosData: string | null
  modoUefi: boolean
  secureBoot: boolean | null
  serial: string | null
}

export interface MemoryStick {
  slot: string
  capacidadeGb: number
  velocidadeMhz: number
  partNumber: string | null
  fabricante: string | null
  ocupado: boolean
}

export interface MemoryInfo {
  totalGb: number
  velocidadeMhz: number
  tecnologia: 'DDR4' | 'DDR5' | string
  canal: 'dual' | 'single' | null
  sticks: MemoryStick[]
}

export interface GpuInfo {
  nome: string | null
  vramGb: number | null
  driverVersao: string | null
  driverData: string | null
  resolucaoAtiva: string | null
  taxaHz: number | null
}

export interface StorageHealth {
  status: 'saudavel' | 'atencao' | 'critico'
  horasLigadas: number | null
  ciclos: number | null
  tbw: number | null
}

export interface StorageDevice {
  modelo: string
  tipo: 'NVMe' | 'SSD' | 'HDD'
  capacidadeGb: number
  usadoGb: number
  tempC: number | null
  particoes: string[]
  smart: StorageHealth
}

export interface NetworkInfo {
  adaptador: string | null
  velocidadeLinkMbps: number | null
  ipv4: string | null
  gateway: string | null
  mac: string | null
  dhcp: boolean | null
}

export interface MonitorInfo {
  fabricante: string | null
  modelo: string | null
  resolucao: string | null
  taxaHz: number | null
  principal: boolean
}

export interface AudioInfo {
  saidaPadrao: string | null
  dispositivos: string[]
}

export interface BatteryInfo {
  percentual: number
  carregando: boolean
}

export interface PowerInfo {
  planoAtivo: string | null
  bateria: BatteryInfo | null
}

export interface PeripheralsInfo {
  usbCount: number
  mouse: string | null
  teclado: string | null
}

export interface OsInfo {
  edicao: string
  build: string
  dataInstalacao: string
  uptimeHoras: number
}

export interface MachineRecord {
  hostname: string
  emServicoDesde: string
  horasOperacao: number | null
  serialBios: string | null
  /** Hash curto do conjunto de hardware — identifica a máquina entre sessões. */
  assinatura: string
}

export interface HardwareInventory {
  cpu: CpuInfo
  board: BoardInfo
  memoria: MemoryInfo
  gpu: GpuInfo
  discos: StorageDevice[]
  rede: NetworkInfo
  monitores: MonitorInfo[]
  audio: AudioInfo
  energia: PowerInfo
  perifericos: PeripheralsInfo
  os: OsInfo
  origin: DataOrigin
}

// ---------------------------------------------------------------------------
// Limpeza
// ---------------------------------------------------------------------------

export type CleanupCategoryId =
  | 'temp-usuario'
  | 'temp-windows'
  | 'cache-apps'
  | 'cache-navegadores'
  | 'miniaturas'
  | 'logs-antigos'
  | 'lixeira'
  | 'relatorios-erro'
  | 'restos-instalacao'
  | 'cache-shader'
  | 'cache-update'
  | 'cache-delivery'

/** Nomes/descrições das categorias ficam no i18n do módulo de tela — aqui só ids. */
export interface CleanupCategory {
  id: CleanupCategoryId
  tamanhoBytes: number
  arquivos: number
  /** Contado à parte: outro processo segura o arquivo, então não vira espaço prometido. */
  bytesEmUso: number
  arquivosEmUso: number
  sensivel: boolean
  selecionadaPorPadrao: boolean
}

// ---------------------------------------------------------------------------
// Níveis de prontidão (L5 STOCK → L1 REDLINE)
// ---------------------------------------------------------------------------

export type ReadinessLevel = 5 | 4 | 3 | 2 | 1

export interface LevelChange {
  moduleId: string
  descricaoKey: string
  aplicado: boolean
}

// ---------------------------------------------------------------------------
// Diagnóstico
// ---------------------------------------------------------------------------

export interface LatencyDevice {
  nome: string
  tipo: 'mouse' | 'teclado'
  taxaHz: number | null
  /** Polling nominal do fabricante é estimado; medição Raw Input será measured. */
  taxaHzOrigin: DataOrigin | null
  dpi: number | null
  /** Limite do sensor informado pelo fabricante; não representa o DPI ativo. */
  dpiMax: Sourced<number> | null
  latenciaMs: Sourced<number> | null
  /** Interface inferida do modelo/árvore PnP. */
  conexao: Sourced<string> | null
  /** MouseSensitivity do Windows (1..20). */
  pointerSpeed: Sourced<number> | null
  /** Estado do registro do usuário; não representa latência física do dispositivo. */
  mouseAcceleration: Sourced<boolean> | null
  /** Valor bruto KeyboardSpeed (0..31) lido do registro. */
  keyboardRepeatRate: Sourced<number> | null
  /** Valor bruto KeyboardDelay (0..3) lido do registro. */
  keyboardRepeatDelay: Sourced<number> | null
}

export interface BottleneckResult {
  /** null quando a máquina estava ociosa: sem carga, a diferença CPU/GPU é ruído. */
  pctEstimado: number | null
  /** Percentual projetado após aplicar as recomendações; null quando não há projeção. */
  pctProjetado: number | null
  origin: DataOrigin
  recomendacoesIds: string[]
  /** Carga máxima observada (%) — o que decide se a medição vale. */
  cargaPico: number
}

export type GameId =
  | 'cs2'
  | 'lol'
  | 'fivem'
  | 'valorant'
  | 'fortnite'
  | 'gta5'
  | 'rocketleague'
  | 'apex'
  | 'dota2'
  | 'r6'
  | 'overwatch2'
  | 'cod'
  | 'pubg'
  | 'roblox'

/**
 * completo = GPU + tela cheia + prioridade (sem anti-cheat de kernel).
 * gpu-tela = sem IFEO: anti-cheat de kernel pode bloquear o launch.
 * nenhum   = só limpeza de cache: o executável real muda a cada versão.
 */
export type GameTuning = 'completo' | 'gpu-tela' | 'nenhum'

export interface GameTarget {
  id: GameId
  instalado: boolean
  caminho: string | null
  tuning: GameTuning
  cacheBytes: number
  cachePastas: number
  gpuAlta: boolean
  telaCheiaDireta: boolean
  prioridadeAlta: boolean
}

export interface GameCacheResult {
  id: string
  liberadoBytes: number
  pastas: number
  falhas: number
  origin: DataOrigin
}

/** Jogos cujo arquivo de config e range de valores estão confirmados. */
export type GameConfigId = 'gta5' | 'cs2' | 'lol'
export type GameConfigPreset = 'desempenho' | 'equilibrado' | 'visual'

/**
 * preset   = valores nossos, todos dentro do range que a UI oficial alcança.
 * snapshot = cópia do que a pessoa configurou no próprio jogo, porque a
 *            semântica dos valores não é documentada por ninguém.
 */
export type GameConfigMode = 'preset' | 'snapshot'

export interface GameConfigItem {
  id: GameConfigId
  disponivel: boolean
  arquivo: string | null
  modo: GameConfigMode
  presetAtual: string | null
  temBackup: boolean
  valores: Array<{ chave: string; valor: string }>
}

export interface GameConfigApplyResult {
  id: string
  preset: string
  arquivo: string
  camposTocados: number
  origin: DataOrigin
}

export interface GameConfigRestoreResult {
  id: string
  arquivo: string
  origin: DataOrigin
}

/** Pastas que o pure mode do FiveM inspeciona. */
export type FiveMFolder = 'mods' | 'plugins' | 'addons'

export interface FiveMScan {
  instalado: boolean
  versao: string | null
  canal: string | null
  dumpCompleto: boolean
  configCliente: string | null
  configGraficos: string | null
  caches: Array<{ id: string; caminho: string; existe: boolean; bytes: number }>
  mods: Array<{ id: string; caminho: string; arquivos: number; bytes: number }>
  backup: string
  origin: DataOrigin
}

export interface FiveMCleanResult {
  liberadoBytes: number
  pastas: number
  falhas: number
  origin: DataOrigin
}

export interface FiveMIsolateResult {
  pasta: string
  movidos: number
  falhas: number
  destino: string
  origin: DataOrigin
}

// ---------------------------------------------------------------------------
// Inicialização e hub de ajustes
// ---------------------------------------------------------------------------

export type StartupSourceId = 'hkcu-run' | 'hklm-run' | 'hklm-run32' | 'pasta-usuario' | 'pasta-comum'

export interface StartupEntry {
  id: string
  nome: string
  comando: string
  origemId: StartupSourceId
  ativado: boolean
  precisaAdmin: boolean
  protegido: boolean
}

export type TweakCategoria =
  | 'privacidade'
  | 'interface'
  | 'jogos'
  | 'rede'
  | 'energia'
  | 'servicos'
  | 'seguranca'

export interface TweakState {
  id: string
  ligado: boolean
  precisaAdmin: boolean
}

export interface TweakScan {
  items: TweakState[]
  admin: boolean
}

// ---------------------------------------------------------------------------
// FPS Booster
// ---------------------------------------------------------------------------

export type FpsBoostCategoria =
  | 'multimidia'
  | 'jogos'
  | 'energia'
  | 'memoria'
  | 'disco'
  | 'rede'
  | 'entrada'
  | 'interface'
  | 'risco'

export interface FpsBoostState {
  id: string
  ligado: boolean
  precisaAdmin: boolean
  /** false quando o hardware desta máquina não comporta o ajuste (a tela diz por quê). */
  disponivel: boolean
  /** Contexto medido: RAM detectada, tipo de disco, quantos dispositivos foram tocados. */
  detalhe: string | null
}

export interface FpsBoostScan {
  items: FpsBoostState[]
  admin: boolean
  /** Total de RAM lido do Windows — base do agrupamento de svchost. */
  ramGb: number
  /** Disco do sistema é SSD/NVMe: decide prefetch e economia de energia do disco. */
  discoSolido: boolean
}

export interface RuntimeState {
  id: string
  instalado: boolean
  /** Versão medida quando o detector devolve uma; 'ok' quando só dá para saber presença. */
  versao: string
  /** Para o DirectX: as DLLs que faltam. */
  detalhe: string
  opcional: boolean
  instalavel: boolean
}

export interface RuntimeScan {
  items: RuntimeState[]
  winget: boolean
  admin: boolean
}

export interface RuntimeInstall {
  id: string
  ok: boolean
  codigo: number
  reinicio: boolean
  instalado: boolean
  versao: string
  detalhe: string
}

export interface BenchmarkRun {
  baseline: SystemMetrics
  depois: SystemMetrics | null
  deltas: { cpuUsage: number; gpuUsage: number; ramUsedGb: number } | null
  origin: DataOrigin
}

// ---------------------------------------------------------------------------
// Jobs (máquina de estados)
// ---------------------------------------------------------------------------

export type JobState =
  | 'idle'
  | 'preparing'
  | 'scanning'
  | 'running'
  | 'applying'
  | 'success'
  | 'warning'
  | 'error'
  | 'cancelled'

export interface SystemJob {
  id: string
  moduloId: string
  tituloKey: string
  state: JobState
  etapaKey: string | null
  progressoPct: number | null
  inicioMs: number
  duracaoMs: number | null
  cancelavel: boolean
  resultado: string | null
  erro: string | null
}

// ---------------------------------------------------------------------------
// Log (registro de operações)
// ---------------------------------------------------------------------------

export interface OperationLog {
  id: string
  timestampIso: string
  moduloId: string
  acao: string
  resultado: string
  reversivel: boolean
  revertido: boolean
  detalhes: string
}

export interface RestorePoint {
  id: string
  nome: string
  criadoEmIso: string
}

// ---------------------------------------------------------------------------
// Perfis, configurações e feed
// ---------------------------------------------------------------------------

export interface GameProfile {
  processo: string
  nomeJogo: string
  levelAoDetectar: ReadinessLevel
}

export interface AppSettings {
  iniciarComWindows: boolean
  minimizarBandeja: boolean
  intensidadeAnimacao: 'total' | 'reduzida' | 'off'
  somAtivo: boolean
  somVolume: number
  notificacoes: boolean
  modoDemo: boolean
  confirmarAntesLimpar: boolean
  pontoRestauracaoPadrao: boolean
  dadosAvancados: boolean
  atalhoModoPartida: string
}

export interface KillFeedEntry {
  id: string
  alvo: string
  acao: 'encerrado' | 'removido' | 'parado' | 'revertido' | 'ajustado' | 'limpo'
  quantidade: string | null
  timestamp: number
  logId: string | null
}

export interface ProcessInfo {
  pid: number
  /** Todos os PIDs quando o backend agrupou instâncias do mesmo executável. */
  pids?: number[]
  instances?: number
  nome: string
  ramMb: number
  origin: DataOrigin
}
