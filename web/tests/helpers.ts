import { db } from '@/lib/db'

// Dados únicos por execução — os testes rodam no MySQL de dev sem limpeza.
export function uniq(label: string): string {
  return `test_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createUser(label: string) {
  return db.user.create({
    data: { email: `${uniq(label)}@teste.local`, name: `Teste ${label}` },
  })
}

export function mensalPlan() {
  return db.plan.findUniqueOrThrow({
    where: { slug: 'mensal' },
    include: { prices: { where: { active: true, currency: 'BRL' } } },
  })
}
