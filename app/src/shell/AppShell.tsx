import { Suspense, useState } from 'react'
import { useNav } from '../stores/nav'
import { SCREENS } from '../modules/registry'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomBar } from './BottomBar'
import { KillFeed } from './KillFeed'
import { ToastHost } from './ToastHost'
import { RestartBanner } from './RestartBanner'
import { Skeleton } from '../components/states'
import './shell.css'

export function AppShell({ stagger }: { stagger: boolean }) {
  const { screen, wipeKey } = useNav()
  const [collapsed, setCollapsed] = useState(false)
  const Screen = SCREENS[screen]

  return (
    <div className="appshell">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} stagger={stagger} />
      <Topbar stagger={stagger} />
      <RestartBanner />
      {/* wipe diagonal a cada navegação — nunca crossfade */}
      <main key={wipeKey} className={`mainarea wipe-in ${stagger ? 'hud-in' : ''}`} style={{ animationDelay: stagger ? '120ms' : undefined }}>
        <Suspense
          fallback={
            <div className="p-8">
              <Skeleton className="mb-4 h-8 w-64" />
              <Skeleton className="mb-2 h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          }
        >
          <Screen />
        </Suspense>
      </main>
      <BottomBar stagger={stagger} />
      <ToastHost />
      <KillFeed />
    </div>
  )
}
