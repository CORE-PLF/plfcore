import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { requireStaff } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Painel administrativo',
  robots: { index: false, follow: false },
}

// Guard de área: nenhuma rota /admin renderiza sem papel de staff.
// A verificação de 2FA fica no layout do grupo (painel) — /admin/2fa precisa
// ficar fora dela para não criar loop de redirecionamento.
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  await requireStaff('SUPPORT')
  return <>{children}</>
}
