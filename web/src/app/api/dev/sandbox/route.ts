import { NextRequest, NextResponse } from 'next/server'
import { hmacSign } from '@/lib/crypto'
import { env } from '@/lib/env'

// Simulador do sandbox: gera um webhook HMAC-assinado e o envia ao MESMO
// endpoint de produção — o fluxo pedido → webhook → licença é o real.
// Fora do provedor sandbox este endpoint não existe (404).

const RESULTADOS = ['approved', 'declined', 'refunded', 'chargeback'] as const
type Resultado = (typeof RESULTADOS)[number]

export async function POST(req: NextRequest) {
  if (env.PAYMENT_PROVIDER !== 'sandbox') return new NextResponse(null, { status: 404 })

  let orderId = ''
  let resultado = ''
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { orderId?: string; resultado?: string }
    orderId = String(body.orderId ?? '')
    resultado = String(body.resultado ?? '')
  } else {
    const fd = await req.formData().catch(() => null)
    orderId = String(fd?.get('orderId') ?? '')
    resultado = String(fd?.get('resultado') ?? '')
  }

  if (!orderId || !RESULTADOS.includes(resultado as Resultado))
    return NextResponse.json(
      { error: 'Informe orderId e resultado (approved | declined | refunded | chargeback).' },
      { status: 400 },
    )

  const rawBody = JSON.stringify({
    eventId: crypto.randomUUID(),
    type: `payment.${resultado}`,
    providerPaymentId: `sbx_${orderId}`,
  })
  const res = await fetch(`${env.APP_URL}/api/webhooks/payments?provider=sandbox`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-signature': hmacSign(rawBody) },
    body: rawBody,
  })
  if (!res.ok)
    return NextResponse.json(
      { error: `O webhook respondeu ${res.status}. Verifique os logs do servidor.` },
      { status: 502 },
    )

  // 303: o navegador volta com GET para a página do pedido
  return NextResponse.redirect(new URL(`/comprar/pedido/${orderId}`, env.APP_URL), 303)
}
