import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { audit } from '@/lib/audit'
import { currentUser } from '@/lib/session'

// Exportação LGPD: perfil, pedidos e licenças do próprio usuário, em JSON.
// Nada de hash de senha, ciphertext de chave ou segredo TOTP aqui.

export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.redirect(new URL('/entrar', env.APP_URL))

  const [orders, licenses] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true, slug: true } }, payments: true },
    }),
    db.license.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true, slug: true } }, devices: true },
    }),
  ])

  const data = {
    geradoEm: new Date().toISOString(),
    perfil: {
      id: user.id,
      nome: user.name,
      email: user.email,
      emailVerificadoEm: user.emailVerifiedAt,
      pais: user.country,
      idioma: user.locale,
      discordUsername: user.discordUsername,
      receberAvisos: user.notifyOptIn,
      criadoEm: user.createdAt,
    },
    pedidos: orders.map((o) => ({
      id: o.id,
      criadoEm: o.createdAt,
      plano: o.plan.name,
      moeda: o.currency,
      subtotalCentavos: o.subtotalCents,
      descontoCentavos: o.discountCents,
      totalCentavos: o.totalCents,
      status: o.status,
      pagoEm: o.paidAt,
      pagamentos: o.payments.map((p) => ({
        metodo: p.method,
        status: p.status,
        valorCentavos: p.amountCents,
        criadoEm: p.createdAt,
      })),
    })),
    licencas: licenses.map((l) => ({
      id: l.id,
      chaveMascarada: l.keyMasked,
      plano: l.plan.name,
      status: l.status,
      ativadaEm: l.activatedAt,
      expiraEm: l.expiresAt,
      limiteDispositivos: l.deviceLimit,
      dispositivos: l.devices.map((d) => ({
        nome: d.name,
        hwid: d.hwid,
        primeiroUso: d.firstSeenAt,
        ultimoUso: d.lastSeenAt,
        desvinculadoEm: d.revokedAt,
      })),
    })),
  }

  await audit({ actorUserId: user.id, action: 'user.data_export', entity: 'user', entityId: user.id })

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="resync-meus-dados.json"',
      'Cache-Control': 'no-store',
    },
  })
}
