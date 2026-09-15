import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db'
import { BRAND } from '@/lib/brand'
import { hasStaffRole, requireUser } from '@/lib/auth'
import { logoutAction } from '@/lib/actions/auth'
import { getGates } from '@/lib/gates'
import { Maintenance } from '@/components/maintenance'
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
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: 'rgba(5,5,6,0.92)', borderColor: 'var(--color-line)' }}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} — início`}>
              <span
                aria-hidden
                className="block h-4 w-4 shrink-0"
                style={{
                  background: 'var(--color-signal)',
                  clipPath: 'polygon(25% 0, 100% 0, 100% 75%, 75% 100%, 0 100%, 0 25%)',
                }}
              />
              <span className="type-display text-xl leading-none">{BRAND.name}</span>
            </Link>
            <span className="type-kicker hidden sm:block">/ PAINEL</span>
          </div>

          <div className="flex min-w-0 items-center gap-4">
            {areaLinks.length > 0 && (
              <nav className="hidden items-center gap-3 sm:flex" aria-label="Outras áreas">
                {areaLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="type-kicker transition-colors hover:text-ink-1">
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
                  className="type-mono flex h-8 w-8 shrink-0 items-center justify-center text-sm text-ink-1"
                  style={{ background: 'var(--color-steel)', boxShadow: 'inset 0 0 0 1px var(--color-edge)' }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-40 truncate text-sm text-ink-2 md:block">{user.name}</span>
            </div>

            <form action={logoutAction}>
              <button type="submit" className="btn btn--ghost btn--sm chamfer">
                SAIR
              </button>
            </form>
          </div>
        </div>

        {areaLinks.length > 0 && (
          <nav
            className="flex items-center gap-4 border-t px-4 py-2 sm:hidden"
            style={{ borderColor: 'var(--color-line)' }}
            aria-label="Outras áreas"
          >
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
    </div>
  )
}
