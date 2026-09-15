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
    <div className="ml-auto md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-ctl border border-edge-2 bg-surface-2"
      >
        <span aria-hidden className={`block h-0.5 w-4 bg-ink-1 transition-transform ${open ? 'translate-y-1 rotate-45' : ''}`} />
        <span aria-hidden className={`block h-0.5 w-4 bg-ink-1 transition-transform ${open ? '-translate-y-1 -rotate-45' : ''}`} />
      </button>

      {open && (
        <nav aria-label="Menu" className="absolute inset-x-0 top-full border-b border-edge bg-carbon">
          <ul className="px-4 py-2">
            {nav.map((item) => (
              <li key={item.href} className="border-b border-line last:border-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-3.5 text-[13px] font-semibold tracking-[0.04em] text-ink-1"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="flex gap-2 py-4">
              <Link href={area ? area.href : '/entrar'} onClick={() => setOpen(false)} className="btn btn--ghost flex-1">
                {area ? area.label : 'ENTRAR'}
              </Link>
              <Link href="/download" onClick={() => setOpen(false)} className="btn btn--primary flex-1">
                BAIXAR
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  )
}
