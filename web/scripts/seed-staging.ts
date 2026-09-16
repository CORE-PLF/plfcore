// Seed do AMBIENTE DE TESTES (staging): catálogo + contas de mentira + um staff
// SUPERADMIN cujo segredo TOTP é CONHECIDO — quem automatiza gera o código de 6
// dígitos pelo mesmo algoritmo do site. A 2FA continua obrigatória em staging:
// o que muda é o segredo ser público, não o portão sair do caminho.
//
// Uso: STAGING_ADMIN_EMAIL=... STAGING_ADMIN_PASSWORD=... npm run db:seed:staging
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import {
  decrypt,
  generateTotpSecret,
  hashPassword,
  openTotpSecret,
  sealTotpSecret,
  sha256,
  totpCode,
} from '../src/lib/crypto'
import { db } from '../src/lib/db'
import { createOrder } from '../src/lib/checkout'
import { activateLicense, issueOrExtendLicense } from '../src/lib/licensing'

// Hosts de PRODUÇÃO. Comparação é por host EXATO, não por substring:
// staging.core.proleague.com.br é staging e precisa passar.
const HOSTS_PRODUCAO = ['core.proleague.com.br', 'www.core.proleague.com.br', 'proleague.com.br']

const CLIENTE_DEMO = 'cliente@plfcore.dev'
const PLANO_DEMO = 'mensal'
const PEDIDO_REF = 'staging-seed' // marca o pedido semeado — torna o script idempotente

export function hostDeProducao(...urls: (string | undefined)[]): string | null {
  for (const raw of urls) {
    if (!raw) continue
    let host: string
    try {
      host = new URL(raw).hostname.toLowerCase()
    } catch {
      host = raw.trim().toLowerCase() // valor que não é URL: compara como veio
    }
    if (HOSTS_PRODUCAO.includes(host)) return host
  }
  return null
}

function aborta(motivo: string): never {
  console.error(`SEED DE STAGING ABORTADO: ${motivo}`)
  process.exit(1)
}

// Segredo já semeado continua valendo (rodar duas vezes não invalida o código
// que já está na mão de quem automatiza). ENCRYPTION_KEY trocada = gera outro.
function segredoExistente(guardado: string | null | undefined): string | null {
  if (!guardado) return null
  try {
    return openTotpSecret(guardado)
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const email = process.env.STAGING_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.STAGING_ADMIN_PASSWORD

  if (process.env.NODE_ENV === 'production')
    aborta('NODE_ENV=production. Este seed grava dados de mentira — nunca em produção.')
  if (!databaseUrl) aborta('DATABASE_URL não definida.')

  const producao = hostDeProducao(databaseUrl, appUrl)
  if (producao) aborta(`alvo de produção detectado (${producao}) em DATABASE_URL/APP_URL.`)

  if (!email || !password)
    aborta(
      'faltou STAGING_ADMIN_EMAIL e/ou STAGING_ADMIN_PASSWORD.\n' +
        'Uso: STAGING_ADMIN_EMAIL=staff@staging.local STAGING_ADMIN_PASSWORD=... npm run db:seed:staging',
    )
  if (password.length < 12) aborta('STAGING_ADMIN_PASSWORD precisa de pelo menos 12 caracteres.')

  const alvo = new URL(databaseUrl)
  console.log(`Alvo: ${alvo.hostname}:${alvo.port || 3306}${alvo.pathname} — APP_URL ${appUrl}`)

  // catálogo + contas de demonstração: o seed de desenvolvimento já faz tudo
  // isso e é idempotente. Import dinâmico porque ele abre a própria conexão.
  const { seedDev, db: seedDb } = await import('../prisma/seed')
  await seedDev()
  await seedDb.$disconnect()

  // ===== staff SUPERADMIN com TOTP conhecido =====
  const atual = await db.user.findUnique({ where: { email } })
  const secret = segredoExistente(atual?.totpSecret) ?? generateTotpSecret()
  const passwordHash = await hashPassword(password)
  const staff = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Staff Staging',
      passwordHash,
      staffRole: 'SUPERADMIN',
      emailVerifiedAt: new Date(),
      totpSecret: sealTotpSecret(secret),
    },
    update: {
      staffRole: 'SUPERADMIN',
      passwordHash,
      emailVerifiedAt: new Date(),
      totpSecret: sealTotpSecret(secret),
    },
  })

  // ===== pedido pago + licença ativa do cliente de mentira =====
  const cliente = await db.user.findUniqueOrThrow({ where: { email: CLIENTE_DEMO } })
  const jaSemeado = await db.order.findFirst({
    where: { userId: cliente.id, providerRef: PEDIDO_REF },
  })
  if (!jaSemeado) {
    const pedido = await createOrder(cliente.id, PLANO_DEMO)
    await db.order.update({
      where: { id: pedido.id },
      data: { status: 'PAID', provider: 'sandbox', providerRef: PEDIDO_REF, paidAt: new Date() },
    })
    const plan = await db.plan.findUniqueOrThrow({ where: { slug: PLANO_DEMO } })
    const emitida = await db.$transaction((tx) =>
      issueOrExtendLicense(tx, { userId: cliente.id, plan, orderId: pedido.id }),
    )
    if (emitida.plainKey) await activateLicense(emitida.plainKey, sha256(`${PEDIDO_REF}-device`))
  }

  const licenca = await db.license.findFirst({
    where: { userId: cliente.id },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`
STAGING PRONTO — tudo aqui é dado de mentira.

  Painel:            ${appUrl}/admin
  Staff SUPERADMIN:  ${staff.email} (senha: a de STAGING_ADMIN_PASSWORD)
  TOTP secret (hex): ${secret}
  Código agora:      ${totpCode(secret)}  (vale <= 30s; gere o próximo com totpCode(secret) de src/lib/crypto)

  Cliente:           ${CLIENTE_DEMO} / plfcore123
  Licença ${licenca?.status ?? '—'}:   ${licenca ? decrypt(licenca.keyCiphertext) : '—'}
`)
  await db.$disconnect()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error(err instanceof Error ? err.message : err)
    await db.$disconnect().catch(() => {})
    process.exit(1)
  })
}
