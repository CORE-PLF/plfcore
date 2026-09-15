import Link from 'next/link'
import type { ReactNode } from 'react'
import { BRAND } from '@/lib/brand'
import { Chamfer } from '@/components/ui'

// Grupo de autenticação: sem header/footer do site — só a marca como rota de volta.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="type-display mb-8 text-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        aria-label={`${BRAND.name} — voltar para a página inicial`}
      >
        {BRAND.name}
      </Link>
      <Chamfer cut={12} brackets className="w-full max-w-md">
        <div className="p-6 sm:p-8">{children}</div>
      </Chamfer>
    </main>
  )
}
