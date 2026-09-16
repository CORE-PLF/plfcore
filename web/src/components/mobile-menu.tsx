'use client'

import Link from 'next/link'
import { useState } from 'react'

// Ilha client mínima: só o menu do celular precisa de estado.
export function MobileMenu({
  nav,
  area,
}: {
  nav: readonly { href: string; label: string }[]
  area: { href: string; label: string }
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="ml-auto md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-ctl border border-edge-2 bg-transparent"
      >
        <span aria-hidden className={`block h-0.5 w-4 bg-ink-1 transition-transform ${open ? 'translate-y-1 rotate-45' : ''}`} />
        <span aria-hidden className={`block h-0.5 w-4 bg-ink-1 transition-transform ${open ? '-translate-y-1 -rotate-45' : ''}`} />
      </button>

      {open && (
        <nav aria-label="Menu" className="absolute inset-x-0 top-full border-b border-line bg-void">
          <ul className="px-4 py-2">
            {[...nav, area].map((item) => (
              <li key={item.href} className="border-b border-line last:border-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-3.5 text-[12px] font-bold tracking-[0.16em] text-ink-1"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="py-4">
              <Link href="/#planos" onClick={() => setOpen(false)} className="btn btn--primary w-full">
                COMPRAR
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  )
}
