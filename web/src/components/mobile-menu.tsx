'use client'

import Link from 'next/link'
import { useState } from 'react'

// Ilha client mínima: só o menu do celular precisa de estado.
export function MobileMenu({
  nav,
  area,
}: {
  nav: readonly { href: string; label: string }[]
  area: { href: string; label: string } | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5"
      >
        <span aria-hidden className={`block h-0.5 w-5 bg-ink-1 transition-transform ${open ? 'translate-y-1 rotate-45' : ''}`} />
        <span aria-hidden className={`block h-0.5 w-5 bg-ink-1 transition-transform ${open ? '-translate-y-1 -rotate-45' : ''}`} />
      </button>

      {open && (
        <nav
          aria-label="Menu"
          className="absolute inset-x-0 top-full border-b border-line"
          style={{ background: 'rgba(5,5,6,0.98)' }}
        >
          <ul className="px-4 py-3">
            {nav.map((item) => (
              <li key={item.href} className="border-b border-line last:border-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="type-kicker block py-3.5 text-[13px] !text-ink-1"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="flex gap-3 py-4">
              {area ? (
                <Link href={area.href} onClick={() => setOpen(false)} className="btn btn--primary btn--sm chamfer flex-1">
                  {area.label}
                </Link>
              ) : (
                <>
                  <Link href="/entrar" onClick={() => setOpen(false)} className="btn btn--ghost btn--sm chamfer flex-1">
                    ENTRAR
                  </Link>
                  <Link href="/#planos" onClick={() => setOpen(false)} className="btn btn--primary btn--sm chamfer flex-1">
                    ESCOLHER PLANO
                  </Link>
                </>
              )}
            </li>
          </ul>
        </nav>
      )}
    </div>
  )
}
