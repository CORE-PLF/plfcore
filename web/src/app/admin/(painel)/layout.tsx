import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { logoutAction } from '@/lib/actions/auth'
import { hasStaffRole, requireStaff } from '@/lib/auth'
import { BRAND } from '@/lib/brand'
import { TOTP_COOKIE, totpCookieValid } from '../totp-cookie'
import { AdminNav } from './nav'
import { NAV_GROUPS } from './nav-items'

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff('SUPPORT')
  // 2FA OBRIGATÓRIA para todo staff: sem segredo cadastrado, nada do painel
  // renderiza — /admin/2fa oferece o cadastro e o portão de verificação.
  if (!user.totpSecret) redirect('/admin/2fa')
  const jar = await cookies()
  if (!totpCookieValid(user.id, jar.get(TOTP_COOKIE)?.value)) redirect('/admin/2fa')
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => hasStaffRole(user, i.min)),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-line bg-carbon lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b border-line px-4 py-4 lg:py-5">
          <Link href="/admin" className="type-display min-w-0 text-lg leading-none">
            {BRAND.name} <span className="text-signal">OPS</span>
          </Link>
        </div>
        <div className="flex items-center gap-2 px-4 py-3 lg:border-b lg:border-line">
          <span
            aria-hidden
            className="circle flex h-7 w-7 shrink-0 items-center justify-center border border-edge-2 bg-surface-2 text-[12px] font-bold text-ink-1"
          >
            {user.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink-1">{user.name}</span>
            <span className="type-kicker block">{user.staffRole}</span>
          </span>
        </div>

        <div className="lg:flex-1">
          <AdminNav groups={groups} />
        </div>

        {/* saída da operação: sem isto, /admin só sai trocando a URL na mão */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Link href="/painel" className="text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink-1">
            MEU PAINEL
          </Link>
          <form action={logoutAction} className="ml-auto">
            <button type="submit" className="btn btn--ghost btn--sm chamfer">
              SAIR
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  )
}
