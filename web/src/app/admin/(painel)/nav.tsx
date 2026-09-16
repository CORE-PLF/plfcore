'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { NavItem } from './nav-items'

// os grupos chegam JÁ filtrados pelo papel do staff (o servidor é quem decide)
export function AdminNav({ groups }: { groups: { title: string; items: NavItem[] }[] }) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
  const flat = groups.flatMap((g) => g.items)

  return (
    <>
      {/* desktop: sidebar agrupada, item ativo com barra amarela de 3px */}
      <nav className="hidden lg:block" aria-label="Seções do painel administrativo">
        {groups.map((g) => (
          <div key={g.title} className="pb-2">
            <p className="type-kicker px-4 pt-4 pb-1.5 text-ink-4">{g.title}</p>
            <ul>
              {g.items.map((i) => {
                const active = isActive(i.href)
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex h-9 items-center px-4 text-[13px] font-semibold tracking-[0.02em] transition-colors ${
                        active ? 'bg-surface-2 text-ink-1' : 'text-ink-3 hover:bg-surface-2/50 hover:text-ink-1'
                      }`}
                    >
                      {active && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signal" />}
                      {i.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* mobile: uma fileira rolável, sem grupos (não cabe) */}
      <nav
        className="flex gap-1 overflow-x-auto px-3 pb-3 lg:hidden"
        aria-label="Seções do painel administrativo"
      >
        {flat.map((i) => {
          const active = isActive(i.href)
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap rounded-ctl px-3 py-2 text-[12px] font-semibold ${
                active ? 'bg-surface-2 text-ink-1' : 'text-ink-3'
              }`}
            >
              {i.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
