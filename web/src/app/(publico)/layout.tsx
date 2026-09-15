import type { ReactNode } from 'react'
import { Maintenance } from '@/components/maintenance'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { getGates } from '@/lib/gates'
import { currentUser } from '@/lib/session'

// O modo de manutenção é lido a cada request: prerender congelaria o aviso.
export const dynamic = 'force-dynamic'

export default async function PublicoLayout({ children }: { children: ReactNode }) {
  const gates = await getGates()
  if (gates.maintenanceMode) {
    const user = await currentUser()
    const staff = user !== null && user.staffRole !== 'NONE'
    if (!staff) return <Maintenance supportUrl={gates.supportUrl || undefined} />
  }
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  )
}
