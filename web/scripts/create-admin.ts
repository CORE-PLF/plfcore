// Cria/promove o superadmin: ADMIN_EMAIL + ADMIN_PASSWORD do ambiente.
// Uso: ADMIN_EMAIL=voce@dominio.com ADMIN_PASSWORD=... npm run admin:create
import 'dotenv/config'
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/crypto'

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    console.error('Faltou ADMIN_EMAIL e/ou ADMIN_PASSWORD no ambiente.')
    console.error('Uso: ADMIN_EMAIL=voce@dominio.com ADMIN_PASSWORD=... npm run admin:create')
    process.exit(1)
  }
  if (password.length < 12) {
    console.error('ADMIN_PASSWORD precisa de pelo menos 12 caracteres.')
    process.exit(1)
  }

  const passwordHash = await hashPassword(password)
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Superadmin',
      passwordHash,
      staffRole: 'SUPERADMIN',
      emailVerifiedAt: new Date(),
    },
    // conta existente: promove e redefine a senha para a informada
    update: { staffRole: 'SUPERADMIN', passwordHash },
  })

  console.log(`Superadmin pronto: ${user.email} (id ${user.id}).`)
  await db.$disconnect()
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err)
  await db.$disconnect().catch(() => {})
  process.exit(1)
})
