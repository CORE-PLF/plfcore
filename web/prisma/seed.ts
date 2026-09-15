// Seed SOMENTE de desenvolvimento — cria catálogo + contas de demonstração.
// NUNCA rodar em produção (o README do deploy cria só o superadmin, via script próprio).
import 'dotenv/config'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../src/generated/prisma/client'
import { hashPassword } from '../src/lib/crypto'

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
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed de desenvolvimento não roda em produção.')
  }

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
  }

  // planos fora do catálogo atual ficam inativos (histórico de pedidos preservado)
  await db.plan.updateMany({
    where: { productId: product.id, slug: { notIn: PLANS.map((p) => p.slug) } },
    data: { active: false, featured: false },
  })

  // packs de crédito para revendedores (produto oculto do catálogo público)
  const creditos = await db.product.upsert({
    where: { slug: 'creditos' },
    create: { slug: 'creditos', name: 'Créditos de revenda' },
    update: {},
  })
  const PACKS = [
    { slug: 'pack-100', name: 'PACK R$ 100', amountCents: 10000, creditCents: 10000 },
    { slug: 'pack-250', name: 'PACK R$ 250', amountCents: 25000, creditCents: 26500 },
    { slug: 'pack-500', name: 'PACK R$ 500', amountCents: 50000, creditCents: 55000 },
  ]
  for (const [i, p] of PACKS.entries()) {
    const plan = await db.plan.upsert({
      where: { slug: p.slug },
      create: {
        productId: creditos.id,
        slug: p.slug,
        name: p.name,
        durationDays: 0,
        sortOrder: i,
        features: { creditCents: p.creditCents },
      },
      update: { features: { creditCents: p.creditCents } },
    })
    await db.price.upsert({
      where: { planId_currency: { planId: plan.id, currency: 'BRL' } },
      create: { planId: plan.id, currency: 'BRL', amountCents: p.amountCents },
      update: { amountCents: p.amountCents },
    })
  }

  await db.setting.upsert({
    where: { key: 'refund_window_days' },
    create: { key: 'refund_window_days', value: 7 },
    update: {},
  })

  await db.appVersion.upsert({
    where: { version: '1.0.0' },
    create: {
      version: '1.0.0',
      channel: 'stable',
      notes: 'Primeira versão pública: diagnóstico real, limpeza segura, otimizações reversíveis.',
      fileName: 'PLF-1.0.0-setup.exe',
      checksum: 'sha256:preencher-no-deploy-real',
      publishedAt: new Date(),
    },
    update: {},
  })

  // ===== contas de demonstração (dev) =====
  const senha = await hashPassword('plfcore123')

  const admin = await db.user.upsert({
    where: { email: 'admin@plfcore.dev' },
    create: {
      email: 'admin@plfcore.dev',
      name: 'Admin Dev',
      passwordHash: senha,
      staffRole: 'SUPERADMIN',
      emailVerifiedAt: new Date(),
    },
    update: { staffRole: 'SUPERADMIN' },
  })

  const cliente = await db.user.upsert({
    where: { email: 'cliente@plfcore.dev' },
    create: { email: 'cliente@plfcore.dev', name: 'Cliente Dev', passwordHash: senha, emailVerifiedAt: new Date() },
    update: {},
  })

  const afiliadoUser = await db.user.upsert({
    where: { email: 'afiliado@plfcore.dev' },
    create: { email: 'afiliado@plfcore.dev', name: 'Afiliado Dev', passwordHash: senha, emailVerifiedAt: new Date() },
    update: {},
  })
  await db.affiliate.upsert({
    where: { userId: afiliadoUser.id },
    create: { userId: afiliadoUser.id, code: 'AFILIADODEV', status: 'APPROVED', commissionBps: 1500 },
    update: { status: 'APPROVED' },
  })

  const revendaUser = await db.user.upsert({
    where: { email: 'revenda@plfcore.dev' },
    create: { email: 'revenda@plfcore.dev', name: 'Revenda Dev', passwordHash: senha, emailVerifiedAt: new Date() },
    update: {},
  })
  const reseller = await db.reseller.upsert({
    where: { userId: revendaUser.id },
    create: { userId: revendaUser.id, status: 'APPROVED', tier: 1, discountBps: 2500, creditBalanceCents: 50000 },
    update: { status: 'APPROVED' },
  })
  const hasLedger = await db.resellerLedger.findFirst({ where: { resellerId: reseller.id } })
  if (!hasLedger) {
    await db.resellerLedger.create({
      data: {
        resellerId: reseller.id,
        type: 'ADMIN_ADJUST',
        deltaCents: 50000,
        balanceAfter: 50000,
        note: 'Créditos iniciais de desenvolvimento',
      },
    })
  }

  console.log('Seed ok:', {
    admin: admin.email,
    cliente: cliente.email,
    afiliado: afiliadoUser.email,
    revenda: revendaUser.email,
    senha: 'plfcore123',
  })
}

main().finally(() => db.$disconnect())
