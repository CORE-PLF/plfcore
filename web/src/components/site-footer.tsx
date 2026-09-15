import Link from 'next/link'
import { BRAND } from '@/lib/brand'

const LINKS: { href: string; label: string }[] = [
  { href: '/download', label: 'Download' },
]

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t" style={{ borderColor: 'var(--color-line)' }}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-6">
        <p className="type-display text-xl leading-none">{BRAND.name}</p>
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-sm transition-colors hover:text-[var(--color-ink-1)]"
                  style={{ color: 'var(--color-ink-3)' }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t" style={{ borderColor: 'var(--color-line)' }}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4">
          <p className="type-mono text-[11px]" style={{ color: 'var(--color-ink-4)' }}>
            © {new Date().getFullYear()} {BRAND.fullName}. Todos os direitos reservados.
          </p>
          <p className="type-mono text-[11px]" style={{ color: 'var(--color-ink-4)' }}>
            SEM DADOS SIMULADOS. SEM DIAGNÓSTICO GENÉRICO.
          </p>
        </div>
      </div>
    </footer>
  )
}
