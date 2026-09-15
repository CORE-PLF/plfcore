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
    <span className="pill pill--signal h-5 px-2 text-[10px]" aria-label={`${n} não lidas`}>
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
      {/* desktop: sidebar igual à do app — item ativo com barra amarela de 3px */}
      <aside className="hidden w-56 shrink-0 md:block">
        <nav className="surface sticky top-24 overflow-hidden" aria-label="Navegação do painel">
          <p className="px-5 pb-1 pt-4 text-[10px] font-bold tracking-[0.18em] text-ink-3">PAINEL</p>
          <ul className="pb-2">
            {ITEMS.map((item) => {
              const active = isActive(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex h-11 items-center justify-between gap-2 px-5 text-[13px] font-semibold tracking-[0.04em] transition-colors ${
                      active ? 'bg-surface-2 text-ink-1' : 'text-ink-3 hover:text-ink-1'
                    }`}
                  >
                    {active && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-signal" />}
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
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-edge px-4 pb-2 md:hidden"
        aria-label="Navegação do painel"
      >
        {ITEMS.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ctl px-3 py-2 text-[12px] font-semibold tracking-[0.04em] ${
                active ? 'bg-surface-2 text-ink-1' : 'text-ink-3'
              }`}
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
