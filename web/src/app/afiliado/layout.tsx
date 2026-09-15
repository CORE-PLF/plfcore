import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Kicker } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Programa de afiliados' }

const NAV = [
  { href: '/afiliado', label: 'PAINEL' },
  { href: '/afiliado/comissoes', label: 'COMISSÕES' },
  { href: '/afiliado/saques', label: 'SAQUES' },
  { href: '/afiliado/materiais', label: 'MATERIAIS' },
  { href: '/afiliado/config', label: 'CONFIGURAÇÃO' },
] as const

export default async function AfiliadoLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const affiliate = await db.affiliate.findUnique({ where: { userId: user.id } })
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Kicker>PROGRAMA DE AFILIADOS</Kicker>
        {affiliate?.status === 'APPROVED' && (
          <nav
            aria-label="Seções do painel de afiliado"
            className="mt-3 flex items-center gap-5 overflow-x-auto border-b pb-3"
            style={{ borderColor: 'var(--color-line)' }}
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="type-kicker whitespace-nowrap transition-colors hover:text-[var(--color-ink-1)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
    </>
  )
}
