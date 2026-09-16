import type { StaffRole } from '@/generated/prisma/client'

export interface NavItem {
  href: string
  label: string
  min: StaffRole
}

// Agrupado por frente de trabalho: 14 links soltos viravam um paredão ilegível.
export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'OPERAÇÃO',
    items: [
      { href: '/admin', label: 'Visão geral', min: 'SUPPORT' },
      { href: '/admin/pedidos', label: 'Pedidos', min: 'SUPPORT' },
      { href: '/admin/licencas', label: 'Licenças', min: 'SUPPORT' },
      { href: '/admin/usuarios', label: 'Usuários', min: 'SUPPORT' },
      { href: '/admin/tickets', label: 'Tickets', min: 'SUPPORT' },
    ],
  },
  {
    title: 'CATÁLOGO',
    items: [
      { href: '/admin/planos', label: 'Planos', min: 'ADMIN' },
      { href: '/admin/cupons', label: 'Cupons', min: 'ADMIN' },
      { href: '/admin/versoes', label: 'Versões do app', min: 'ADMIN' },
    ],
  },
  {
    title: 'PARCEIROS',
    items: [
      { href: '/admin/afiliados', label: 'Afiliados', min: 'ADMIN' },
      { href: '/admin/revendedores', label: 'Revendedores', min: 'ADMIN' },
    ],
  },
  {
    title: 'SISTEMA',
    items: [
      { href: '/admin/jobs', label: 'Fila (jobs)', min: 'ADMIN' },
      { href: '/admin/webhooks', label: 'Webhooks', min: 'ADMIN' },
      { href: '/admin/auditoria', label: 'Auditoria', min: 'ADMIN' },
      { href: '/admin/config', label: 'Configurações', min: 'ADMIN' },
    ],
  },
]
