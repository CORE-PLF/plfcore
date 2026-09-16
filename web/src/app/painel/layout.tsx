import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { hasStaffRole, requireUser } from '@/lib/auth'
import { logoutAction } from '@/lib/actions/auth'
import { getGates } from '@/lib/gates'
import { Maintenance } from '@/components/maintenance'
import { Logo } from '@/components/site-header'
import { PainelNav } from './nav'

export const metadata: Metadata = {
  title: 'Painel',
}

export default async function PainelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const gates = await getGates()
  if (gates.maintenanceMode && user.staffRole === 'NONE') {
    return <Maintenance supportUrl={gates.supportUrl || undefined} />
  }
  const [roles, unread] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { affiliate: { select: { id: true } }, reseller: { select: { id: true } } },
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ])

  const areaLinks = [
    ...(hasStaffRole(user, 'SUPPORT') ? [{ href: '/admin', label: 'ADMIN' }] : []),
    ...(roles.affiliate ? [{ href: '/afiliado', label: 'AFILIADO' }] : []),
    ...(roles.reseller ? [{ href: '/revenda', label: 'REVENDA' }] : []),
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-edge bg-carbon">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="type-kicker hidden sm:block">/ PAINEL</span>
          </div>

          <div className="flex min-w-0 items-center gap-4">
            {areaLinks.length > 0 && (
              <nav className="hidden items-center gap-1 sm:flex" aria-label="Outras áreas">
                {areaLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="px-3 py-2 text-[12px] font-semibold tracking-[0.04em] text-ink-3 transition-colors hover:text-ink-1"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
            )}

            <div className="flex min-w-0 items-center gap-2.5">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="circle h-8 w-8 shrink-0" />
              ) : (
                <span
                  aria-hidden
                  className="circle flex h-8 w-8 shrink-0 items-center justify-center border border-edge-2 bg-surface-2 text-sm font-bold text-ink-1"
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-40 truncate text-sm text-ink-2 md:block">{user.name}</span>
            </div>

            <form action={logoutAction}>
              <button type="submit" className="btn btn--ghost btn--sm">
                SAIR
              </button>
            </form>
          </div>
        </div>

        {areaLinks.length > 0 && (
          <nav className="flex items-center gap-4 border-t border-line px-4 py-2 sm:hidden" aria-label="Outras áreas">
            {areaLinks.map((l) => (
              <Link key={l.href} href={l.href} className="type-kicker whitespace-nowrap">
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:py-10">
        <PainelNav unread={unread} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-3">Aplicativo</p>
            <p className="mt-1 text-sm text-ink-3">Versão atual para Windows 10 e 11.</p>
          </div>
          <Link href="/download" className="btn btn--primary">
            BAIXAR APP
          </Link>
        </div>
      </footer>
    </div>
  )
}
