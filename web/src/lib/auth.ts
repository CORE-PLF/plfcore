import { redirect } from 'next/navigation'
import type { StaffRole, User } from '@/generated/prisma/client'
import { currentUser } from './session'

// Guards de página/ação — a autorização REAL acontece aqui (backend), nunca na UI.

// Destino de retorno pós-login: só caminho do próprio site. '//' e '/\' são
// tratados como host pelo navegador (open redirect) e por isso caem fora.
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  // quebra de linha em Location = header splitting
  if (/[\r\n\t]/.test(value)) return null
  return value
}

export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser()
  if (!user) {
    const destino = safeNext(next)
    redirect(destino ? `/entrar?next=${encodeURIComponent(destino)}` : '/entrar')
  }
  return user
}

const STAFF_ORDER: StaffRole[] = ['NONE', 'SUPPORT', 'ADMIN', 'SUPERADMIN']

export function hasStaffRole(user: User, min: StaffRole): boolean {
  return STAFF_ORDER.indexOf(user.staffRole) >= STAFF_ORDER.indexOf(min)
}

export async function requireStaff(min: StaffRole = 'SUPPORT'): Promise<User> {
  const user = await requireUser()
  if (!hasStaffRole(user, min)) redirect('/painel')
  return user
}
