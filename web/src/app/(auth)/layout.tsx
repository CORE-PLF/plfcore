import type { ReactNode } from 'react'
import { Logo } from '@/components/site-header'
import { Surface } from '@/components/ui'

// Grupo de autenticação: sem header/footer do site — só a marca como rota de volta.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo className="h-9" />
      </div>
      <Surface className="w-full max-w-md">
        <div className="p-6 sm:p-8">{children}</div>
      </Surface>
    </main>
  )
}
