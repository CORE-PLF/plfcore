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
    <footer className="mt-auto border-t border-edge bg-carbon">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-6">
        <Logo className="h-5" />
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[13px] text-ink-3 transition-colors hover:text-ink-1">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4">
          <p className="type-num text-[11px] text-ink-4">
            © {new Date().getFullYear()} {BRAND.fullName}. Todos os direitos reservados.
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">
            App oficial do servidor Pro League · Sem dados simulados
          </p>
        </div>
      </div>
    </footer>
  )
}
