import Image from 'next/image'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { hasStaffRole } from '@/lib/auth'
import { currentUser } from '@/lib/session'
import { MobileMenu } from './mobile-menu'

// Navegação comercial vive na landing — âncoras funcionam de qualquer página.
const NAV = [
  { href: '/#modulos', label: 'O QUE FAZ' },
  { href: '/#planos', label: 'PLANOS' },
] as const

export function Logo({ className = 'h-5' }: { className?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} — início`}>
      <Image src="/brand/logo-header.png" alt="Pro League" width={317} height={106} priority className={`${className} w-auto`} />
      <span className="text-[10px] font-bold tracking-[0.24em] text-ink-3">CORE</span>
    </Link>
  )
}

export async function SiteHeader() {
  const user = await currentUser()
  // Staff entra direto na própria área; o painel de cliente continua acessível por lá.
  const area = user
    ? hasStaffRole(user, 'SUPPORT')
      ? { href: '/admin', label: 'ADMIN' }
      : { href: '/painel', label: 'PAINEL' }
    : { href: '/entrar', label: 'ENTRAR' }
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-void/90 backdrop-blur-[10px]">
      <div className="relative mx-auto flex h-[60px] w-full max-w-6xl items-center gap-4 px-4">
        <Logo />

        <div className="ml-auto hidden items-center gap-[18px] md:flex">
          <nav className="flex items-center gap-[18px]" aria-label="Navegação principal">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[11px] font-bold tracking-[0.16em] text-ink-3 transition-colors hover:text-ink-1"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={area.href}
              className="text-[11px] font-bold tracking-[0.16em] text-ink-3 transition-colors hover:text-ink-1"
            >
              {area.label}
            </Link>
          </nav>
          <Link href="/#planos" className="btn btn--primary btn--sm">
            COMPRAR
          </Link>
        </div>

        <MobileMenu nav={NAV} area={area} />
      </div>
    </header>
  )
}
