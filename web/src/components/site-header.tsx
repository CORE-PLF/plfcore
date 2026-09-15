import Image from 'next/image'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { hasStaffRole } from '@/lib/auth'
import { currentUser } from '@/lib/session'
import { MobileMenu } from './mobile-menu'

// Navegação comercial vive na landing — âncoras funcionam de qualquer página.
const NAV = [
  { href: '/#produto', label: 'O QUE FAZ' },
  { href: '/#como-funciona', label: 'COMO FUNCIONA' },
  { href: '/#transparencia', label: 'TRANSPARÊNCIA' },
  { href: '/#planos', label: 'PLANOS' },
] as const

export function Logo({ className = 'h-6' }: { className?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} — início`}>
      <Image src="/brand/logo-header.png" alt="Pro League" width={317} height={106} priority className={`${className} w-auto`} />
      <span className="type-num text-[10px] tracking-[0.12em] text-ink-3">CORE</span>
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
    : null
  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-carbon">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-[12px] font-semibold tracking-[0.04em] text-ink-3 transition-colors hover:text-ink-1"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link href={area ? area.href : '/entrar'} className="btn btn--ghost btn--sm">
            {area ? area.label : 'ENTRAR'}
          </Link>
          <Link href="/download" className="btn btn--primary btn--sm">
            BAIXAR
          </Link>
        </div>

        <MobileMenu nav={NAV} area={area} />
      </div>
    </header>
  )
}
