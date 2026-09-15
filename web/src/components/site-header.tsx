import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { hasStaffRole } from '@/lib/auth'
import { currentUser } from '@/lib/session'
import { MobileMenu } from './mobile-menu'

// Navegação comercial vive na landing — âncoras funcionam de qualquer página.
const NAV = [
  { href: '/#produto', label: 'PRODUTO' },
  { href: '/#como-funciona', label: 'COMO FUNCIONA' },
  { href: '/#transparencia', label: 'TRANSPARÊNCIA' },
  { href: '/#planos', label: 'PLANOS' },
] as const

export async function SiteHeader() {
  const user = await currentUser()
  // Staff entra direto na própria área; o painel de cliente continua acessível por lá.
  const area = user
    ? hasStaffRole(user, 'SUPPORT')
      ? { href: '/admin', label: 'ADMIN' }
      : { href: '/painel', label: 'PAINEL' }
    : null
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ background: 'rgba(5,5,6,0.94)', borderColor: 'var(--color-line)' }}
    >
      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} — início`}>
          <span
            aria-hidden
            className="block h-4 w-4"
            style={{
              background: 'var(--color-signal)',
              clipPath: 'polygon(25% 0, 100% 0, 100% 75%, 75% 100%, 0 100%, 0 25%)',
            }}
          />
          <span className="type-display text-xl leading-none">{BRAND.name}</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Navegação principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="type-kicker transition-colors hover:text-[var(--color-ink-1)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {area ? (
            <Link href={area.href} className="btn btn--primary btn--sm chamfer">
              {area.label}
            </Link>
          ) : (
            <>
              <Link href="/entrar" className="type-kicker transition-colors hover:text-[var(--color-ink-1)]">
                ENTRAR
              </Link>
              <Link href="/#planos" className="btn btn--primary btn--sm chamfer">
                ESCOLHER PLANO
              </Link>
            </>
          )}
        </div>

        <MobileMenu nav={NAV} area={area} />
      </div>
    </header>
  )
}
