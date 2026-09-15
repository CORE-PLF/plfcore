import Link from 'next/link'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { db } from '@/lib/db'
import { currentUser } from '@/lib/session'

const TABS = [
  { href: '/revenda', label: 'PAINEL' },
  { href: '/revenda/creditos', label: 'CRÉDITOS' },
  { href: '/revenda/emitir', label: 'EMITIR' },
  { href: '/revenda/licencas', label: 'LICENÇAS' },
  { href: '/revenda/relatorios', label: 'RELATÓRIOS' },
] as const

export default async function RevendaLayout({ children }: { children: ReactNode }) {
  const user = await currentUser()
  const reseller = user
    ? await db.reseller.findUnique({ where: { userId: user.id }, select: { status: true } })
    : null

  return (
    <>
      <SiteHeader />
      {reseller?.status === 'APPROVED' && (
        <nav
          aria-label="Painel de revenda"
          className="border-b"
          style={{ borderColor: 'var(--color-line)', background: 'var(--color-carbon)' }}
        >
          <div className="mx-auto flex w-full max-w-6xl items-center gap-6 overflow-x-auto px-4 py-3">
            <span className="type-kicker whitespace-nowrap" style={{ color: 'var(--color-signal)' }}>
              REVENDA
            </span>
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="type-kicker whitespace-nowrap transition-colors hover:text-[var(--color-ink-1)]"
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <SiteFooter />
    </>
  )
}
