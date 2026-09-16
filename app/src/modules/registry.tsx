import { lazy } from 'react'
import type { ScreenId } from '../stores/nav'

// Cada tela é um módulo em src/modules/<id>/ com componente default + i18n próprios.
export const SCREENS: Record<ScreenId, React.LazyExoticComponent<React.ComponentType>> = {
  cockpit: lazy(() => import('./cockpit/CockpitScreen')),
  fpsboost: lazy(() => import('./fpsboost/FpsBoostScreen')),
  xray: lazy(() => import('./xray/XRayScreen')),
  memory: lazy(() => import('./memory/MemoryScreen')),
  cleanup: lazy(() => import('./cleanup/CleanupScreen')),
  windows: lazy(() => import('./windows/WindowsScreen')),
  games: lazy(() => import('./games/GamesScreen')),
  sounds: lazy(() => import('./sounds/SoundsScreen')),
  tweaks: lazy(() => import('./tweaks/TweaksScreen')),
  runtimes: lazy(() => import('./runtimes/RuntimesScreen')),
  startup: lazy(() => import('./startup/StartupScreen')),
  latency: lazy(() => import('./latency/LatencyScreen')),
  bottleneck: lazy(() => import('./bottleneck/BottleneckScreen')),
  stop: lazy(() => import('./stop/StopScreen')),
  settings: lazy(() => import('./settings/SettingsScreen')),
  log: lazy(() => import('./log/LogScreen')),
}
