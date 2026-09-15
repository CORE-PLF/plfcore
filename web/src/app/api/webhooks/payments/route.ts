import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { getProviderByName } from '@/lib/payments'
import { processPaymentEvent } from '@/lib/fulfillment'

// Fonte oficial de confirmação de pagamento. Assinatura inválida = 401 e
// registro para auditoria. Processamento idempotente (replay seguro).

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))

  const providerName = req.nextUrl.searchParams.get('provider') ?? env.PAYMENT_PROVIDER
  const provider = getProviderByName(providerName)
  if (!provider) return NextResponse.json({ error: 'provedor desconhecido' }, { status: 400 })

  let event
  try {
    event = await provider.parseWebhook(rawBody, headers)
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', evt: 'webhook.parse_error', provider: providerName, msg: String(err) }))
    return NextResponse.json({ error: 'falha ao processar' }, { status: 500 })
  }

  if (!event) {
    await db.paymentEvent
      .create({
        data: {
          provider: providerName,
          eventId: `invalid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'signature_invalid',
          payload: { bodyPreview: rawBody.slice(0, 500) },
          signatureValid: false,
        },
      })
      .catch(() => {})
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 })
  }

  try {
    const result = await processPaymentEvent(providerName, event)
    return NextResponse.json({ ok: result.ok, skipped: result.skipped ?? undefined })
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', evt: 'webhook.process_error', eventId: event.eventId, msg: String(err) }))
    // 500 → o provedor reenvia; o processamento é idempotente
    return NextResponse.json({ error: 'erro interno' }, { status: 500 })
  }
}
