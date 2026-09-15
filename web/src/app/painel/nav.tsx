'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/painel', label: 'VISÃO GERAL' },
  { href: '/painel/licenca', label: 'LICENÇAS' },
  { href: '/painel/pedidos', label: 'PEDIDOS' },
  { href: '/painel/dispositivos', label: 'DISPOSITIVOS' },
  { href: '/painel/notificacoes', label: 'NOTIFICAÇÕES' },
  { href: '/painel/suporte', label: 'SUPORTE' },
  { href: '/painel/conta', label: 'CONTA' },
  { href: '/painel/seguranca', label: 'SEGURANÇA' },
] as const

function Badge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <span
      className="type-mono px-1.5 text-[10px] leading-4"
      style={{ background: 'var(--color-signal)', color: '#0a0508' }}
      aria-label={`${n} não lidas`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

export function PainelNav({ unread }: { unread: number }) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/painel' ? pathname === '/painel' : pathname.startsWith(href)

  return (
    <>
      {/* desktop: sidebar chanfrada */}
      <aside className="hidden w-52 shrink-0 md:block">
        <nav
          className="chamfer chamfer--flat sticky top-24"
          style={{ '--cut': '8px' } as React.CSSProperties}
          aria-label="Navegação do painel"
        >
          <ul className="py-2">
            {ITEMS.map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className="type-kicker flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:text-ink-1"
                    style={
                      active
                        ? {
                            color: 'var(--color-ink-1)',
                            background: 'rgba(255, 46, 63, 0.08)',
                            boxShadow: 'inset 2px 0 0 var(--color-signal)',
                          }
                        : undefined
                    }
                  >
                    <span>{item.label}</span>
                    {item.href === '/painel/notificacoes' && <Badge n={unread} />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      {/* mobile: nav horizontal scrollável */}
      <nav
        className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 pb-2 md:hidden"
        style={{ borderColor: 'var(--color-line)' }}
        aria-label="Navegação do painel"
      >
        {ITEMS.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="type-kicker flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2"
              style={
                active
                  ? { color: 'var(--color-ink-1)', boxShadow: 'inset 0 -2px 0 var(--color-signal)' }
                  : undefined
              }
            >
              <span>{item.label}</span>
              {item.href === '/painel/notificacoes' && <Badge n={unread} />}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
