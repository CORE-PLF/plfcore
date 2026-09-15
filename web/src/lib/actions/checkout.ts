'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createOrder } from '@/lib/checkout'
import { db } from '@/lib/db'
import { getGates } from '@/lib/gates'
import { getPaymentProvider } from '@/lib/payments'
import { realIp } from '@/lib/ip'
import { rateLimit } from '@/lib/ratelimit'
import { TERMOS_LICENCA_VERSAO } from '@/lib/termos'

const METODOS = ['PIX', 'CARD', 'BOLETO'] as const
type Metodo = (typeof METODOS)[number]

// Preço e cupom recalculados no servidor (createOrder → quoteOrder); nada vem do navegador.
export async function iniciarCompraAction(
  planoSlug: string,
  cupom: string | undefined,
  formData: FormData,
): Promise<void> {
  const user = await requireUser(
    `/comprar/${encodeURIComponent(planoSlug)}${cupom ? `?cupom=${encodeURIComponent(cupom)}` : ''}`,
  )
  const gates = await getGates()

  const intentRaw = String(formData.get('intent') ?? 'EXTEND')
  const intent = intentRaw === 'NEW_INSTALL' ? 'NEW_INSTALL' : 'EXTEND'

  const voltar = (erro: string): never => {
    const params = new URLSearchParams()
    if (cupom) params.set('cupom', cupom)
    if (intent === 'NEW_INSTALL') params.set('intent', 'nova')
    params.set('erro', erro)
    redirect(`/comprar/${planoSlug}?${params.toString()}`)
  }

  if (gates.maintenanceMode || !gates.checkoutEnabled)
    voltar('As vendas estão temporariamente pausadas. Tente novamente em instantes.')

  if (!(await rateLimit(`checkout:${user.id}`, 5, 60_000)))
    voltar('Muitas tentativas. Aguarde um minuto e tente de novo.')

  const metodoRaw = String(formData.get('metodo') ?? '')
  if (!METODOS.includes(metodoRaw as Metodo)) voltar('Escolha um método de pagamento.')
  const metodo = metodoRaw as Metodo

  // consentimento da licença por instalação: obrigatório, nunca pré-marcado,
  // validado AQUI (servidor) — o required do navegador é só conveniência
  if (formData.get('aceite_instalacao') !== 'on')
    voltar('Confirme que entendeu a regra da licença por instalação para continuar.')

  const h = await headers()
  const ip = realIp(h)

  let destino: string
  try {
    await db.legalAcceptance.upsert({
      where: {
        userId_docType_version: {
          userId: user.id,
          docType: 'licenca-instalacao',
          version: TERMOS_LICENCA_VERSAO,
        },
      },
      create: { userId: user.id, docType: 'licenca-instalacao', version: TERMOS_LICENCA_VERSAO, ip },
      update: {},
    })

    const order = await createOrder(user.id, planoSlug, cupom, intent)
    const start = await getPaymentProvider().createCheckout(order, user, metodo)
    await audit({
      actorUserId: user.id,
      action: 'order.create',
      entity: 'order',
      entityId: order.id,
      after: { planoSlug, metodo, totalCents: order.totalCents, licenseIntent: intent, termos: TERMOS_LICENCA_VERSAO },
    })
    destino = start.redirectUrl ?? `/comprar/pedido/${order.id}`
  } catch (err) {
    voltar(err instanceof Error ? err.message : 'Não foi possível iniciar a compra. Tente de novo.')
    return
  }
  redirect(destino)
}
