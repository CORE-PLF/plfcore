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
  SoundInstallResult,
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
  DebloatResult,
  DebloatScanItem,
  OptimizationResult,
  ProgressCallback,
  SystemAdapter,
  Unsubscribe,
} from './SystemAdapter'

// Adapter de demonstração. TODO dado aqui é fixo/plausível e sai com origin:'demo' —
// a UI é obrigada a exibir o selo MODO DE DEMONSTRAÇÃO.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function djb2Hex(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

const MB = 1024 * 1024
const round1 = (n: number) => Math.round(n * 10) / 10

const DEMO_INVENTORY: HardwareInventory = {
  cpu: {
    nome: 'AMD Ryzen 7 5800X',
    nucleos: 8,
    threads: 16,
    clockBaseGhz: 3.8,
    clockAtualGhz: 4.4,
    cacheL2Mb: 4,
    cacheL3Mb: 32,
    soquete: 'AM4',
    tempC: 52,
    usoPct: 30,
  },
  board: {
    fabricante: 'Gigabyte',
    modelo: 'B550 AORUS ELITE',
    chipset: 'AMD B550',
    biosVersao: 'F17',
    biosData: '2023-01-05',
    modoUefi: true,
    secureBoot: true,
    serial: null,
  },
  memoria: {
    totalGb: 32,
    velocidadeMhz: 3600,
    tecnologia: 'DDR4',
    canal: 'dual',
    sticks: [
      { slot: 'DDR4_A1', capacidadeGb: 0, velocidadeMhz: 0, partNumber: null, fabricante: null, ocupado: false },
      { slot: 'DDR4_A2', capacidadeGb: 16, velocidadeMhz: 3600, partNumber: 'CMK32GX4M2D3600C18', fabricante: 'Corsair', ocupado: true },
      { slot: 'DDR4_B1', capacidadeGb: 0, velocidadeMhz: 0, partNumber: null, fabricante: null, ocupado: false },
      { slot: 'DDR4_B2', capacidadeGb: 16, velocidadeMhz: 3600, partNumber: 'CMK32GX4M2D3600C18', fabricante: 'Corsair', ocupado: true },
    ],
  },
  gpu: {
    nome: 'NVIDIA GeForce RTX 3080',
    vramGb: 10,
    driverVersao: '566.14',
    driverData: '2024-11-12',
    resolucaoAtiva: '1920×1080',
    taxaHz: 165,
  },
  discos: [
    {
      modelo: 'Samsung SSD 980 1TB',
      tipo: 'NVMe',
      capacidadeGb: 1000,
      usadoGb: 610,
      tempC: 38,
      particoes: ['C:'],
      smart: { status: 'saudavel', horasLigadas: 9412, ciclos: 1204, tbw: 23 },
    },
    {
      modelo: 'Seagate Barracuda ST2000DM008',
      tipo: 'HDD',
      capacidadeGb: 2000,
      usadoGb: 1480,
      tempC: null,
      particoes: ['D:'],
      smart: { status: 'saudavel', horasLigadas: null, ciclos: null, tbw: null },
    },
  ],
  rede: {
    adaptador: 'Realtek Gaming 2.5GbE Family Controller',
    velocidadeLinkMbps: 1000,
    ipv4: '192.168.0.42',
    gateway: '192.168.0.1',
    mac: '74:56:3C:8A:1F:02',
    dhcp: true,
  },
  monitores: [{ fabricante: 'AOC', modelo: '24G2', resolucao: '1920×1080', taxaHz: 165, principal: true }],
  audio: {
    saidaPadrao: 'Realtek(R) Audio',
    dispositivos: ['Realtek(R) Audio', 'NVIDIA High Definition Audio'],
  },
  energia: { planoAtivo: 'Equilibrado', bateria: null },
  perifericos: { usbCount: 7, mouse: 'Logitech G PRO X Superlight', teclado: 'HyperX Alloy Origins' },
  os: { edicao: 'Windows 11 Pro 23H2', build: '22631', dataInstalacao: '2023-03-12', uptimeHoras: 6 },
  origin: 'demo',
}

const DEMO_CLEANUP: CleanupCategory[] = [
  { id: 'temp-usuario', tamanhoBytes: 612 * MB, arquivos: 1842, bytesEmUso: 271 * MB, arquivosEmUso: 176, sensivel: false, selecionadaPorPadrao: true },
  { id: 'temp-windows', tamanhoBytes: 488 * MB, arquivos: 973, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: true },
  { id: 'cache-apps', tamanhoBytes: 356 * MB, arquivos: 512, bytesEmUso: 44 * MB, arquivosEmUso: 61, sensivel: false, selecionadaPorPadrao: true },
  { id: 'cache-navegadores', tamanhoBytes: 924 * MB, arquivos: 6210, bytesEmUso: 310 * MB, arquivosEmUso: 2140, sensivel: true, selecionadaPorPadrao: false },
  { id: 'miniaturas', tamanhoBytes: 148 * MB, arquivos: 388, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: true },
  { id: 'logs-antigos', tamanhoBytes: 96 * MB, arquivos: 214, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: true },
  { id: 'lixeira', tamanhoBytes: 402 * MB, arquivos: 57, bytesEmUso: 0, arquivosEmUso: 0, sensivel: true, selecionadaPorPadrao: false },
  { id: 'relatorios-erro', tamanhoBytes: 84 * MB, arquivos: 129, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: true },
  { id: 'restos-instalacao', tamanhoBytes: 121 * MB, arquivos: 46, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: true },
  { id: 'cache-shader', tamanhoBytes: 1310 * MB, arquivos: 842, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: false },
  { id: 'cache-update', tamanhoBytes: 690 * MB, arquivos: 118, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: false },
  { id: 'cache-delivery', tamanhoBytes: 233 * MB, arquivos: 61, bytesEmUso: 0, arquivosEmUso: 0, sensivel: false, selecionadaPorPadrao: false },
]

const DEMO_ITEMS: Record<CleanupCategoryId, string[]> = {
  'temp-usuario': ['AppData\\Local\\Temp\\wct8F3A.tmp', 'AppData\\Local\\Temp\\chrome_installer.log', 'AppData\\Local\\Temp\\~DF2A91.tmp'],
  'temp-windows': ['Windows\\Temp\\CAB_1284.tmp', 'Windows\\Temp\\MpSigStub.log', 'Windows\\Temp\\dd_setup_2024.log'],
  'cache-apps': ['AppData\\Local\\D3DSCache\\a1b2c3', 'AppData\\Local\\NVIDIA\\DXCache\\f01e.bin', 'AppData\\Local\\Packages\\cache\\state.bin'],
  'cache-navegadores': ['Chrome\\Default\\Cache\\f_000381', 'Chrome\\Default\\Code Cache\\js\\index_0', 'Edge\\Default\\Cache\\f_00012a'],
  miniaturas: ['Explorer\\thumbcache_1024.db', 'Explorer\\thumbcache_256.db', 'Explorer\\iconcache_48.db'],
  'logs-antigos': ['Windows\\Logs\\CBS\\CBS_2024.log', 'Windows\\Logs\\DISM\\dism_old.log', 'Windows\\Panther\\setupact.log'],
  lixeira: ['$Recycle.Bin\\S-1-5-21\\$R2K8F1.zip', '$Recycle.Bin\\S-1-5-21\\$RQ01XZ.mp4', '$Recycle.Bin\\S-1-5-21\\$RM3B7A.docx'],
  'relatorios-erro': ['WER\\ReportQueue\\AppCrash_chrome.exe', 'WER\\ReportArchive\\Kernel_141a', 'WER\\Temp\\WERD1A2.tmp'],
  'restos-instalacao': ['Windows\\SoftwareDistribution\\Download\\a8c1', '$WINDOWS.~BT\\Sources\\setup.log', 'ProgramData\\Package Cache\\{9f2b}\\vc_redist.x64.exe'],
  'cache-shader': ['AppData\\Local\\D3DSCache\\21f0a4', 'AppData\\Local\\NVIDIA\\DXCache\\8a3e.toc', 'AppData\\Local\\AMD\\DxCache\\77b1.parc'],
  'cache-update': ['SoftwareDistribution\\Download\\9c44d1', 'SoftwareDistribution\\Download\\41ab availability.cab', 'SoftwareDistribution\\Download\\ssu.msu'],
  'cache-delivery': ['DeliveryOptimization\\Cache\\7f30', 'DeliveryOptimization\\Cache\\b81c', 'DeliveryOptimization\\Cache\\state.db'],
}

const DEMO_PROCESSES: ProcessInfo[] = [
  { pid: 4812, nome: 'chrome_updater.exe', ramMb: 212, origin: 'demo' },
  { pid: 6120, nome: 'spotify_helper.exe', ramMb: 210, origin: 'demo' },
  { pid: 3288, nome: 'OneDrive.exe', ramMb: 148, origin: 'demo' },
  { pid: 7756, nome: 'AdobeUpdater.exe', ramMb: 96, origin: 'demo' },
  { pid: 5904, nome: 'teams_background.exe', ramMb: 178, origin: 'demo' },
  { pid: 8432, nome: 'CCXProcess.exe', ramMb: 64, origin: 'demo' },
]

export class MockSystemAdapter implements SystemAdapter {
  private processos: ProcessInfo[] = DEMO_PROCESSES.map((p) => ({ ...p }))
  private demoRamFreedGb = 0
  private demoCpuRelief = 0

  async getCapabilities(): Promise<AdapterCapabilities> {
    // Demo entrega métricas/SMART/temperaturas (marcadas 'demo'); nada destrutivo é real.
    return {
      metricsAoVivo: true,
      smart: true,
      sensoresTemp: true,
      limpezaReal: false,
      killReal: false,
      tweaksReais: false,
      debloatReal: false,
    }
  }

  async getInventory(): Promise<HardwareInventory> {
    await sleep(350)
    return structuredClone(DEMO_INVENTORY)
  }

  async getMachineRecord(): Promise<MachineRecord> {
    await sleep(120)
    return {
      hostname: 'PLF-DEMO-RIG',
      emServicoDesde: '2023-03-12',
      horasOperacao: 9412,
      serialBios: null,
      assinatura: djb2Hex(JSON.stringify(DEMO_INVENTORY)),
    }
  }

  streamMetrics(cb: (m: SystemMetrics) => void, intervalMs = 1000): Unsubscribe {
    // Random walk limitado: série suave e plausível em torno de CPU~30 / GPU~20 / RAM~13.6GB.
    let cpu = Math.max(12, 30 - this.demoCpuRelief)
    let gpu = 20
    let ram = Math.max(8, 13.6 - this.demoRamFreedGb)
    const walk = (v: number, min: number, max: number, step: number) =>
      Math.min(max, Math.max(min, v + (Math.random() - 0.5) * step))
    const tick = () => {
      cpu = walk(cpu, Math.max(6, 16 - this.demoCpuRelief), Math.max(20, 58 - this.demoCpuRelief), 7)
      gpu = walk(gpu, 6, 42, 6)
      ram = walk(ram, Math.max(4, 13.1 - this.demoRamFreedGb), Math.max(5, 14.2 - this.demoRamFreedGb), 0.18)
      cb({
        cpuUsage: round1(cpu),
        gpuUsage: round1(gpu),
        ramUsedGb: round1(ram),
        ramTotalGb: 32,
        cpuTempC: Math.round(48 + cpu * 0.18),
        cpuTempOrigin: 'demo',
        cpuClockGhz: round1(3.8 + cpu * 0.008),
        gpuTempC: Math.round(42 + gpu * 0.2),
        timestamp: Date.now(),
        origin: 'demo',
      })
    }
    tick()
    const handle = setInterval(tick, intervalMs)
    return () => clearInterval(handle)
  }

  async scanCleanup(): Promise<CleanupCategory[]> {
    await sleep(1400)
    return DEMO_CLEANUP.map((c) => ({ ...c }))
  }

  async executeCleanup(
    ids: CleanupCategoryId[],
    onProgress: ProgressCallback,
    onItem?: (entry: CleanupItemEntry) => void,
  ): Promise<CleanupResult> {
    const inicio = Date.now()
    const selecionadas = DEMO_CLEANUP.filter((c) => ids.includes(c.id))
    const totalBytes = selecionadas.reduce((s, c) => s + c.tamanhoBytes, 0)
    let bytesFeitos = 0
    let arquivos = 0
    onProgress(0, null)
    for (const cat of selecionadas) {
      const itens = DEMO_ITEMS[cat.id]
      for (let i = 0; i < itens.length; i++) {
        await sleep(180 + Math.random() * 220)
        const bytes = Math.round(cat.tamanhoBytes / itens.length)
        bytesFeitos += bytes
        onItem?.({ categoriaId: cat.id, caminho: itens[i], bytes })
        onProgress(Math.min(99, Math.round((bytesFeitos / totalBytes) * 100)), cat.id)
      }
      arquivos += cat.arquivos
      await sleep(150)
    }
    onProgress(100, null)
    return {
      bytesLiberados: totalBytes,
      arquivosRemovidos: arquivos,
      duracaoMs: Date.now() - inicio,
      origin: 'demo',
    }
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    await sleep(300)
    return this.processos.map((p) => ({ ...p }))
  }

  async scanDebloat(): Promise<DebloatScanItem[]> {
    return [
      { id: 'feedback-hub', installed: true },
      { id: 'clipchamp', installed: true },
      { id: 'solitaire', installed: true },
      { id: 'xbox-suite', installed: true },
      { id: 'onedrive', installed: true },
    ]
  }

  async executeDebloat(ids: string[], onProgress: ProgressCallback): Promise<DebloatResult> {
    const items: DebloatResult['items'] = []
    for (let index = 0; index < ids.length; index += 1) {
      await sleep(160)
      items.push({ id: ids[index], status: 'removed' })
      onProgress(((index + 1) / Math.max(1, ids.length)) * 100, ids[index])
    }
    return {
      restorePointCreated: true,
      restorePointMessage: null,
      items,
      removed: items.length,
      failed: 0,
      origin: 'demo',
    }
  }

  async killProcess(pid: number): Promise<ProcessInfo> {
    await sleep(400 + Math.random() * 300)
    const alvo = this.processos.find((p) => p.pid === pid)
    if (!alvo) throw new Error(`ERR_PROCESS_NOT_FOUND:${pid}`)
    this.processos = this.processos.filter((p) => p.pid !== pid)
    this.demoRamFreedGb += alvo.ramMb / 1024
    this.demoCpuRelief = Math.min(10, this.demoCpuRelief + 0.8)
    return { ...alvo }
  }

  async getLatencyInfo(): Promise<LatencyDevice[]> {
    await sleep(250)
    return [
      {
        nome: 'Logitech G PRO X Superlight',
        tipo: 'mouse',
        taxaHz: 1000,
        taxaHzOrigin: 'demo',
        dpi: 800,
        dpiMax: { value: 25600, origin: 'demo' },
        latenciaMs: { value: 1.4, origin: 'demo' },
        conexao: { value: 'LIGHTSPEED / USB', origin: 'demo' },
        pointerSpeed: { value: 10, origin: 'demo' },
        mouseAcceleration: { value: true, origin: 'demo' },
        keyboardRepeatRate: null,
        keyboardRepeatDelay: null,
      },
      {
        nome: 'HyperX Alloy Origins',
        tipo: 'teclado',
        taxaHz: 1000,
        taxaHzOrigin: 'demo',
        dpi: null,
        dpiMax: null,
        latenciaMs: null,
        conexao: { value: 'USB / HID', origin: 'demo' },
        pointerSpeed: null,
        mouseAcceleration: null,
        keyboardRepeatRate: { value: 24, origin: 'demo' },
        keyboardRepeatDelay: { value: 1, origin: 'demo' },
      },
    ]
  }

  async measureBottleneck(onProgress: ProgressCallback): Promise<BottleneckResult> {
    const etapas = ['coleta-cpu', 'coleta-gpu', 'coleta-ram', 'analise'] as const
    for (let i = 0; i < etapas.length; i++) {
      onProgress(Math.round((i / etapas.length) * 100), etapas[i])
      await sleep(600 + Math.random() * 300)
    }
    onProgress(100, null)
    return {
      pctEstimado: 27,
      pctProjetado: 20,
      origin: 'demo',
      recomendacoesIds: ['encerrar-processos-fundo', 'plano-energia-alto', 'atualizar-driver-gpu'],
      cargaPico: 68,
    }
  }

  async scanGames(): Promise<GameTarget[]> {
    await sleep(500)
    const base = { cacheBytes: 0, cachePastas: 0, gpuAlta: false, telaCheiaDireta: false, prioridadeAlta: false }
    return [
      { ...base, id: 'cs2', instalado: true, caminho: 'D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe', tuning: 'completo', cacheBytes: 8_553_683_207, cachePastas: 5 },
      { ...base, id: 'lol', instalado: true, caminho: 'C:\\Riot Games\\League of Legends\\Game\\League of Legends.exe', tuning: 'gpu-tela', cacheBytes: 210_647_637, cachePastas: 2 },
      { ...base, id: 'fivem', instalado: false, caminho: null, tuning: 'completo' },
      { ...base, id: 'valorant', instalado: true, caminho: 'C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe', tuning: 'gpu-tela', cacheBytes: 412_098_331, cachePastas: 4 },
      { ...base, id: 'fortnite', instalado: false, caminho: null, tuning: 'gpu-tela' },
      { ...base, id: 'gta5', instalado: true, caminho: 'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V Enhanced\\GTA5_Enhanced.exe', tuning: 'gpu-tela', cacheBytes: 1_204_886_119, cachePastas: 2 },
      { ...base, id: 'rocketleague', instalado: false, caminho: null, tuning: 'gpu-tela' },
      { ...base, id: 'apex', instalado: false, caminho: null, tuning: 'gpu-tela' },
      { ...base, id: 'dota2', instalado: false, caminho: null, tuning: 'completo' },
      { ...base, id: 'r6', instalado: false, caminho: null, tuning: 'gpu-tela' },
      { ...base, id: 'overwatch2', instalado: false, caminho: null, tuning: 'gpu-tela' },
      { ...base, id: 'cod', instalado: false, caminho: null, tuning: 'nenhum' },
      { ...base, id: 'pubg', instalado: false, caminho: null, tuning: 'gpu-tela' },
      { ...base, id: 'roblox', instalado: true, caminho: 'C:\\Users\\demo\\AppData\\Local\\Roblox\\Versions\\version-8f21\\RobloxPlayerBeta.exe', tuning: 'nenhum', cacheBytes: 688_240_113, cachePastas: 2 },
    ]
  }

  async cleanGameCache(id: GameTarget['id']): Promise<GameCacheResult> {
    await sleep(1400)
    const alvo = (await this.scanGames()).find((g) => g.id === id)
    return { id, liberadoBytes: alvo?.cacheBytes ?? 0, pastas: alvo?.cachePastas ?? 0, falhas: 0, origin: 'demo' }
  }

  private cfgDemo: GameConfigItem[] = [
    {
      id: 'gta5',
      disponivel: true,
      arquivo: 'C:\\Users\\demo\\Documents\\Rockstar Games\\GTA V\\settings.xml',
      modo: 'preset',
      presetAtual: null,
      temBackup: false,
      valores: [
        { chave: 'GrassQuality', valor: '3' },
        { chave: 'ShadowQuality', valor: '2' },
        { chave: 'TextureQuality', valor: '2' },
        { chave: 'Tessellation', valor: '1' },
      ],
    },
    {
      id: 'cs2',
      disponivel: true,
      arquivo: 'D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg\\autoexec.cfg',
      modo: 'preset',
      presetAtual: null,
      temBackup: false,
      valores: [],
    },
    {
      id: 'lol',
      disponivel: true,
      arquivo: 'C:\\Riot Games\\League of Legends\\Config\\game.cfg',
      modo: 'snapshot',
      presetAtual: null,
      temBackup: false,
      valores: [
        { chave: 'Performance.EffectsQuality', valor: '2' },
        { chave: 'Performance.ShadowQuality', valor: '1' },
        { chave: 'General.WaitForVerticalSync', valor: '0' },
      ],
    },
  ]

  async scanGameConfigs(): Promise<GameConfigItem[]> {
    await sleep(700)
    return this.cfgDemo.map((c) => ({ ...c }))
  }

  async applyGameConfig(id: GameConfigId, preset: GameConfigPreset): Promise<GameConfigApplyResult> {
    await sleep(1100)
    const alvo = this.cfgDemo.find((c) => c.id === id)
    const carimbo = alvo?.modo === 'snapshot' ? 'snapshot' : preset
    if (alvo) {
      alvo.presetAtual = carimbo
      alvo.temBackup = true
    }
    return {
      id,
      preset: carimbo,
      arquivo: alvo?.arquivo ?? '',
      camposTocados: alvo?.valores.length ?? 0,
      origin: 'demo',
    }
  }

  async restoreGameConfig(id: GameConfigId): Promise<GameConfigRestoreResult> {
    await sleep(900)
    const alvo = this.cfgDemo.find((c) => c.id === id)
    if (alvo) {
      alvo.presetAtual = null
      alvo.temBackup = false
    }
    return { id, arquivo: alvo?.arquivo ?? '', origin: 'demo' }
  }

  private fivemDemo: FiveMScan = {
    instalado: true,
    versao: '10309',
    canal: 'production',
    dumpCompleto: false,
    configCliente: 'C:\\Users\\demo\\AppData\\Roaming\\CitizenFX\\fivem.cfg',
    configGraficos: 'C:\\Users\\demo\\AppData\\Roaming\\CitizenFX\\gta5_settings.xml',
    caches: [
      { id: 'server-cache', caminho: '…\\FiveM.app\\data\\server-cache', existe: true, bytes: 4_812_331_008 },
      { id: 'server-cache-priv', caminho: '…\\FiveM.app\\data\\server-cache-priv', existe: true, bytes: 812_004_352 },
      { id: 'nui-storage', caminho: '…\\FiveM.app\\data\\nui-storage', existe: true, bytes: 431_226_880 },
      { id: 'cache', caminho: '…\\FiveM.app\\data\\cache', existe: true, bytes: 92_274_688 },
      { id: 'crashes', caminho: '…\\FiveM.app\\crashes', existe: true, bytes: 1_207_959_552 },
      { id: 'logs', caminho: '…\\FiveM.app\\logs', existe: true, bytes: 18_874_368 },
    ],
    mods: [
      { id: 'mods', caminho: '…\\FiveM.app\\mods', arquivos: 3, bytes: 264_241_152 },
      { id: 'plugins', caminho: '…\\FiveM.app\\plugins', arquivos: 1, bytes: 2_097_152 },
      { id: 'addons', caminho: '…\\FiveM.app\\addons', arquivos: 0, bytes: 0 },
    ],
    backup: 'C:\\Users\\demo\\AppData\\Local\\PLFCore\\fivem-backup',
    origin: 'demo',
  }

  async scanFivem(): Promise<FiveMScan> {
    await sleep(900)
    return { ...this.fivemDemo, caches: [...this.fivemDemo.caches], mods: [...this.fivemDemo.mods] }
  }

  async cleanFivemCache(): Promise<FiveMCleanResult> {
    await sleep(1600)
    const total = this.fivemDemo.caches.reduce((s, c) => s + c.bytes, 0)
    this.fivemDemo.caches = this.fivemDemo.caches.map((c) => ({ ...c, bytes: 0 }))
    return { liberadoBytes: total, pastas: 6, falhas: 0, origin: 'demo' }
  }

  async isolateFivemFolder(pasta: FiveMFolder): Promise<FiveMIsolateResult> {
    await sleep(1200)
    const alvo = this.fivemDemo.mods.find((m) => m.id === pasta)
    const movidos = alvo?.arquivos ?? 0
    if (alvo) {
      alvo.arquivos = 0
      alvo.bytes = 0
    }
    return {
      pasta,
      movidos,
      falhas: 0,
      destino: `${this.fivemDemo.backup}\\${pasta}-20260807-120000`,
      origin: 'demo',
    }
  }

  private soundsDemo: SoundsScan = {
    gtaRaiz: 'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V',
    sfx: 'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V\\x64\\audio\\sfx',
    geracao: 'legacy',
    jogoAberto: false,
    biblioteca: 'C:\\Users\\demo\\AppData\\Local\\PLFCore\\sound-packs',
    temBackup: true,
    instaladoId: 'tarkov-m4',
    packs: [
      { id: 'tarkov-m4', nome: 'TARKOV M4', bytes: 41_943_040, temPreview: true },
      { id: 'tarkov-ak', nome: 'TARKOV AK-74', bytes: 38_797_312, temPreview: true },
      { id: 'mw19-five-seven', nome: 'MW19 FIVE-SEVEN', bytes: 12_582_912, temPreview: true },
      { id: 'insurgency-m4', nome: 'INSURGENCY M4', bytes: 33_554_432, temPreview: false },
      { id: 'squad-ak', nome: 'SQUAD AK', bytes: 29_360_128, temPreview: true },
      { id: 'vanilla-plus', nome: 'VANILLA PLUS', bytes: 8_388_608, temPreview: false },
    ],
    origin: 'demo',
  }

  async scanSounds(): Promise<SoundsScan> {
    await sleep(800)
    return { ...this.soundsDemo, packs: [...this.soundsDemo.packs] }
  }

  async installSoundPack(id: string): Promise<SoundInstallResult> {
    await sleep(1800)
    const pack = this.soundsDemo.packs.find((p) => p.id === id)
    if (!pack) throw new Error('ERR_SND_PACK')
    const backupCriado = !this.soundsDemo.temBackup
    this.soundsDemo.temBackup = true
    this.soundsDemo.instaladoId = id
    return { id, backupCriado, arquivos: 4, origin: 'demo' }
  }

  async restoreSounds(): Promise<SoundRestoreResult> {
    await sleep(1400)
    if (!this.soundsDemo.temBackup) throw new Error('ERR_SND_SEM_BACKUP')
    this.soundsDemo.instaladoId = null
    return { arquivos: 4, origin: 'demo' }
  }

  async previewSoundPack(id: string): Promise<void> {
    await sleep(400)
    const pack = this.soundsDemo.packs.find((p) => p.id === id)
    if (!pack || !pack.temPreview) throw new Error('ERR_SND_PACK')
  }
  private startupDemo: StartupEntry[] = [
    { id: 'hkcu-run|Steam', nome: 'Steam', comando: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', origemId: 'hkcu-run', ativado: true, precisaAdmin: false, protegido: false },
    { id: 'hkcu-run|Discord', nome: 'Discord', comando: 'C:\\Users\\demo\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', origemId: 'hkcu-run', ativado: true, precisaAdmin: false, protegido: false },
    { id: 'hkcu-run|Spotify', nome: 'Spotify', comando: 'C:\\Users\\demo\\AppData\\Roaming\\Spotify\\Spotify.exe --autostart', origemId: 'hkcu-run', ativado: false, precisaAdmin: false, protegido: false },
    { id: 'hklm-run|SecurityHealth', nome: 'SecurityHealth', comando: '%windir%\\system32\\SecurityHealthSystray.exe', origemId: 'hklm-run', ativado: true, precisaAdmin: true, protegido: true },
    { id: 'hklm-run32|Lightshot', nome: 'Lightshot', comando: 'C:\\Program Files (x86)\\Skillbrains\\lightshot\\Lightshot.exe', origemId: 'hklm-run32', ativado: true, precisaAdmin: true, protegido: false },
  ]

  private tweaksLigadosDemo = new Set<string>(['gamebar-off'])

  async scanStartup(): Promise<StartupEntry[]> {
    await sleep(400)
    return this.startupDemo.map((e) => ({ ...e }))
  }

  async toggleStartup(id: string, ativar: boolean): Promise<boolean> {
    await sleep(300)
    const alvo = this.startupDemo.find((e) => e.id === id)
    if (alvo && !alvo.protegido) alvo.ativado = ativar
    return alvo?.ativado ?? false
  }

  private runtimesInstaladosDemo = new Set<string>()

  async scanTweaks(): Promise<TweakScan> {
    await sleep(400)
    const ids = [
      'anuncio-id-off',
      'experiencias-personalizadas-off',
      'feedback-off',
      'historico-atividades-off',
      'telemetria-minima',
      'digitacao-voz-off',
      'localizacao-off',
      'telemetria-edge-off',
      'relatorio-erros-off',
      'autologger-off',
      'telemetria-driver-off',
      'tarefas-diagnostico-off',
      'sugestoes-menu-off',
      'copilot-off',
      'widgets-off',
      'busca-bing-off',
      'visual-cru',
      'miniaturas-off',
      'fonte-crua',
      'gamebar-off',
      'tela-cheia-classica',
      'flip-model-on',
      'mpo-off',
      'teclas-aderencia-off',
      'delivery-p2p-off',
      'llmnr-off',
      'netbios-off',
      'nic-energia-off',
      'dns-rapido',
      'hibernacao-off',
      'dump-minidump',
      'fth-off',
      'indexacao-off',
      'spooler-off',
      'acesso-remoto-off',
      'xbox-servicos-off',
      'manutencao-automatica-off',
      'ultimo-acesso-off',
      'prioridade-primeiro-plano',
      'msconfig-limites-off',
      'rsc-off',
      'vbs-off',
    ]
    const semAdmin = new Set([
      'anuncio-id-off',
      'experiencias-personalizadas-off',
      'feedback-off',
      'digitacao-voz-off',
      'sugestoes-menu-off',
      'copilot-off',
      'busca-bing-off',
      'visual-cru',
      'miniaturas-off',
      'fonte-crua',
      'gamebar-off',
      'tela-cheia-classica',
      'flip-model-on',
      'teclas-aderencia-off',
    ])
    const precisaAdmin = new Set(ids.filter((id) => !semAdmin.has(id)))
    return {
      items: ids.map((id) => ({ id, ligado: this.tweaksLigadosDemo.has(id), precisaAdmin: precisaAdmin.has(id) })),
      admin: true,
    }
  }

  private fpsBoostLigadosDemo = new Set<string>(['game-mode-on', 'mouse-1-para-1'])

  async scanFpsBoost(): Promise<FpsBoostScan> {
    await sleep(450)
    const { FPS_BOOST_CATALOG, FPS_BOOST_RISCO } = await import('./fpsBoostCatalog')
    const semAdmin = new Set(['game-mode-on', 'mouse-1-para-1', 'teclado-resposta-maxima', 'acessibilidade-off'])
    const detalhes: Record<string, string> = {
      'svchost-agrupado': 'RAM 32 GB → 33554432 KB',
      'prefetch-superfetch-off': 'disco do sistema é SSD/NVMe',
      'gpu-preempcao-off': 'NVIDIA detectada',
      'disco-sem-economia': '6 chaves de driver',
      'disco-sem-idle-storport': '2 de 2 controladoras',
      'rede-tcp-imediato': 'Ethernet',
      'cpu-idle-off': 'PLF CORE - MAX PERFORMANCE',
    }
    return {
      items: [...FPS_BOOST_CATALOG, FPS_BOOST_RISCO].map((def) => ({
        id: def.id,
        ligado: this.fpsBoostLigadosDemo.has(def.id),
        precisaAdmin: !semAdmin.has(def.id),
        disponivel: true,
        detalhe: detalhes[def.id] ?? null,
      })),
      admin: true,
      ramGb: 32,
      discoSolido: true,
    }
  }

  async setFpsBoost(id: string, ligar: boolean): Promise<boolean> {
    await sleep(500)
    if (ligar) this.fpsBoostLigadosDemo.add(id)
    else this.fpsBoostLigadosDemo.delete(id)
    return ligar
  }

  async scanRuntimes(): Promise<RuntimeScan> {
    await sleep(500)
    const demo: Array<[string, boolean, string, boolean]> = [
      ['vc2015-x64', true, 'v14.44.35211.00', false],
      ['vc2015-x86', true, 'v14.44.35211.00', false],
      ['vc2013-x64', true, 'v12.0.21005.01', false],
      ['vc2013-x86', false, '', false],
      ['vc2012-x64', true, 'v11.0.61030.00', false],
      ['vc2012-x86', true, 'v11.0.61030.00', false],
      ['vc2010-x64', true, 'ok', true],
      ['vc2010-x86', true, 'ok', true],
      ['vc2008-x64', false, '', true],
      ['vc2008-x86', false, '', true],
      ['vc2005-x64', false, '', true],
      ['vc2005-x86', false, '', true],
      ['directx', false, '', false],
      ['dotnet-desktop-8', true, '8.0.8', false],
      ['dotnet-desktop-9', false, '', true],
      ['xna', true, 'ok', true],
      ['netfx', true, '4.8.1', false],
    ]
    return {
      items: demo.map(([id, instalado, versao, opcional]) => ({
        id,
        instalado: this.runtimesInstaladosDemo.has(id) ? true : instalado,
        versao: this.runtimesInstaladosDemo.has(id) ? 'ok' : versao,
        detalhe: id === 'directx' && !instalado && !this.runtimesInstaladosDemo.has(id) ? 'd3dx9_43.dll xaudio2_7.dll' : '',
        opcional,
        instalavel: id !== 'netfx',
      })),
      winget: true,
      admin: true,
    }
  }

  async installRuntime(id: string): Promise<RuntimeInstall> {
    await sleep(1800)
    this.runtimesInstaladosDemo.add(id)
    return { id, ok: true, codigo: 0, reinicio: false, instalado: true, versao: 'ok', detalhe: '' }
  }

  async setTweak(id: string, ligar: boolean): Promise<boolean> {
    await sleep(500)
    if (ligar) this.tweaksLigadosDemo.add(id)
    else this.tweaksLigadosDemo.delete(id)
    return ligar
  }

  async exportLogFile(nome: string): Promise<string> {
    await sleep(200)
    return `C:\\Users\\demo\\Downloads\\${nome}`
  }

  async applyOptimization(profileId: string, onProgress: ProgressCallback): Promise<OptimizationResult> {
    const full = /^(forcado|customizado-0|level-1|boost-seguro|reduzir-gargalo)$/.test(profileId)
    const etapas = full
      ? ['inventario', 'backup', 'energia', 'registro', 'jogos', 'qos', 'interface', 'servicos', 'tarefas', 'consistencia']
      : ['inventario', 'backup', 'energia', 'registro', 'jogos', 'consistencia']
    for (let i = 0; i < etapas.length; i++) {
      onProgress(Math.round((i / etapas.length) * 100), etapas[i])
      await sleep(650 + Math.random() * 250)
    }
    onProgress(100, null)
    const base = ['plano-energia-alto', 'game-mode-registro', 'game-dvr-off', 'mmcss-jogos']
    const aggressive = [
      ...base,
      'cpu-resposta-max',
      'energia-usb-off',
      'pcie-link-off',
      'suspensao-nunca',
      'qos-presenca-off',
      'interface-responsiva',
      'efeitos-visuais-desempenho',
      'apps-segundo-plano',
      'transparencia-off',
      'servicos-lite',
      'tarefas-lite',
    ]
    const alteracoesIds = /^(forcado|customizado-0|level-1|boost-seguro|reduzir-gargalo)$/.test(profileId)
      ? aggressive
      : base
    return {
      profileId,
      alteracoesIds,
      powerPlan: 'PLF CORE - MAX PERFORMANCE',
      performanceVerified: true,
      restartRecommended: full,
      origin: 'demo',
    }
  }

  async revertOptimization(): Promise<OptimizationResult> {
    await sleep(300)
    return {
      profileId: 'restore',
      alteracoesIds: [],
      powerPlan: null,
      performanceVerified: false,
      restartRecommended: false,
      origin: 'demo',
    }
  }
}
