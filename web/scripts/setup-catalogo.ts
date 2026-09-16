// Cria o catálogo (produto + planos + preços) em QUALQUER ambiente, produção
// inclusive. Existe porque o painel não tem CRUD de produto e o seed se recusa
// a rodar em produção — sem isto, um banco novo fica sem plano e não há como
// emitir licença nem vender.
//
// Diferença para o prisma/seed.ts: aqui NÃO há conta de demonstração, nem
// senha conhecida, nem dado fake. Só o catálogo.
//
// Idempotente: roda quantas vezes quiser.
//   npm run catalogo:setup
import 'dotenv/config'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../src/generated/prisma/client'

const url = new URL(process.env.DATABASE_URL ?? '')
const db = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    allowPublicKeyRetrieval: true,
  }),
})

const PLANS = [
  { slug: 'quinzenal', name: '15 DIAS', durationDays: 15 as number | null, amountCents: 2499, featured: false },
  { slug: 'mensal', name: '30 DIAS', durationDays: 30, amountCents: 3999, featured: true },
  { slug: 'vitalicio', name: 'VITALÍCIO', durationDays: null, amountCents: 79999, featured: false },
]

const FEATURES = [
  'Diagnóstico com dados reais do sistema',
  'Otimizações explicadas e reversíveis',
  'Antes e depois medido',
  'Registro completo no LOG',
]

async function main() {
  const product = await db.product.upsert({
    where: { slug: 'plfcore' },
    create: { slug: 'plfcore', name: 'PLF CORE' },
    update: {},
  })

  for (const [i, p] of PLANS.entries()) {
    const plan = await db.plan.upsert({
      where: { slug: p.slug },
      create: {
        productId: product.id,
        slug: p.slug,
        name: p.name,
        durationDays: p.durationDays,
        deviceLimit: 1,
        featured: p.featured,
        sortOrder: i,
        features: FEATURES,
      },
      update: { name: p.name, durationDays: p.durationDays, featured: p.featured, sortOrder: i, active: true },
    })
    await db.price.upsert({
      where: { planId_currency: { planId: plan.id, currency: 'BRL' } },
      create: { planId: plan.id, currency: 'BRL', amountCents: p.amountCents },
      update: { amountCents: p.amountCents },
    })
    console.log(`plano pronto: ${plan.slug} (${plan.name})`)
  }

  const creditos = await db.product.upsert({
    where: { slug: 'creditos' },
    create: { slug: 'creditos', name: 'Créditos de revenda' },
    update: {},
  })

  console.log(`catálogo pronto: ${product.slug} + ${creditos.slug}, ${PLANS.length} planos.`)
}

main()
  .catch((e) => {
    console.error('falhou:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
