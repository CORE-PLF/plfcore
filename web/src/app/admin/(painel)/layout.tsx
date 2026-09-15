import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import type { StaffRole } from '@/generated/prisma/client'
import { logoutAction } from '@/lib/actions/auth'
import { hasStaffRole, requireStaff } from '@/lib/auth'
import { BRAND } from '@/lib/brand'
import { TOTP_COOKIE, totpCookieValid } from '../totp-cookie'

const NAV: { href: string; label: string; min: StaffRole }[] = [
  { href: '/admin', label: 'VISÃO GERAL', min: 'SUPPORT' },
  { href: '/admin/pedidos', label: 'PEDIDOS', min: 'SUPPORT' },
  { href: '/admin/licencas', label: 'LICENÇAS', min: 'SUPPORT' },
  { href: '/admin/usuarios', label: 'USUÁRIOS', min: 'SUPPORT' },
  { href: '/admin/planos', label: 'PLANOS', min: 'ADMIN' },
  { href: '/admin/cupons', label: 'CUPONS', min: 'ADMIN' },
  { href: '/admin/afiliados', label: 'AFILIADOS', min: 'ADMIN' },
  { href: '/admin/revendedores', label: 'REVENDEDORES', min: 'ADMIN' },
  { href: '/admin/versoes', label: 'VERSÕES DO APP', min: 'ADMIN' },
  { href: '/admin/tickets', label: 'TICKETS', min: 'SUPPORT' },
  { href: '/admin/jobs', label: 'FILA (JOBS)', min: 'ADMIN' },
  { href: '/admin/webhooks', label: 'WEBHOOKS', min: 'ADMIN' },
  { href: '/admin/auditoria', label: 'AUDITORIA', min: 'ADMIN' },
  { href: '/admin/config', label: 'CONFIGURAÇÕES', min: 'ADMIN' },
]

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff('SUPPORT')
  // 2FA OBRIGATÓRIA para todo staff: sem segredo cadastrado, nada do painel
  // renderiza — /admin/2fa oferece o cadastro e o portão de verificação.
  if (!user.totpSecret) redirect('/admin/2fa')
  const jar = await cookies()
  if (!totpCookieValid(user.id, jar.get(TOTP_COOKIE)?.value)) redirect('/admin/2fa')
  const items = NAV.filter((i) => hasStaffRole(user, i.min))

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-line bg-carbon lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="px-4 pt-4 pb-2">
          <Link href="/admin" className="type-display text-xl">
            {BRAND.name} <span className="text-signal">OPS</span>
          </Link>
          <p className="type-kicker mt-1">
            {user.staffRole} — {user.name}
          </p>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:gap-0 lg:pb-4"
          aria-label="Seções do painel administrativo"
        >
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="type-kicker whitespace-nowrap px-2 py-2 text-ink-2 transition-colors hover:text-ink-1"
            >
              {i.label}
            </Link>
          ))}
        </nav>
        {/* saída da operação: sem isto, /admin só sai trocando a URL na mão */}
        <div className="flex items-center gap-3 border-t border-line px-4 py-3 lg:mt-auto">
          <Link href="/painel" className="type-kicker text-ink-2 transition-colors hover:text-ink-1">
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
