import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { Logo } from './site-header'

const LINKS: { href: string; label: string }[] = [
  { href: '/download', label: 'Download' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/status', label: 'Status' },
  { href: '/legal/termos', label: 'Termos de uso' },
  { href: '/legal/privacidade', label: 'Privacidade' },
  { href: '/legal/reembolso', label: 'Reembolso' },
]

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6">
        <Logo className="h-5" />
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-4 transition-colors hover:text-ink-1"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="type-num w-full text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-4 lg:w-auto">
          © {new Date().getFullYear()} {BRAND.fullName} · Sem dados simulados
        </p>
      </div>
    </footer>
  )
}
