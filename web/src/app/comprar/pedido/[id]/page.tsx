import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { DemoSeal, Kicker, StatusTag, Surface, SurfaceHead } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import type { OrderStatus } from '@/generated/prisma/client'
import { CopyButton } from './copy-button'

export const metadata: Metadata = { title: 'Pedido' }

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'AGUARDANDO PAGAMENTO',
  AWAITING_PAYMENT: 'AGUARDANDO PAGAMENTO',
  PAID: 'PAGO',
  CANCELLED: 'CANCELADO',
  EXPIRED: 'EXPIRADO',
  IN_REVIEW: 'EM ANÁLISE',
  REFUND_PENDING: 'REEMBOLSO EM PROCESSAMENTO',
  REFUND_FAILED: 'REEMBOLSO COM FALHA',
  REFUNDED: 'REEMBOLSADO',
  PARTIALLY_REFUNDED: 'REEMBOLSADO PARCIALMENTE',
  CHARGEBACK: 'CHARGEBACK',
}

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/comprar/pedido/${encodeURIComponent(id)}`)

  const order = await db.order.findUnique({
    where: { id },
    include: {
      plan: { include: { product: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      coupon: { select: { code: true } },
    },
  })
  if (!order || order.userId !== user.id) notFound()

  const refazerQs = new URLSearchParams()
  if (order.coupon?.code) refazerQs.set('cupom', order.coupon.code)
  if (order.licenseIntent === 'NEW_INSTALL') refazerQs.set('intent', 'nova')
  const refazerHref = `/comprar/${order.plan.slug}${refazerQs.toString() ? `?${refazerQs}` : ''}`

  const payment = order.payments[0] ?? null
  const pendente = order.status === 'PENDING' || order.status === 'AWAITING_PAYMENT'
  const sandbox = payment?.provider === 'sandbox'
  const pix = (payment?.meta as { pixCopiaECola?: string | null } | null)?.pixCopiaECola ?? null
  const license = order.status === 'PAID' ? await db.license.findUnique({ where: { orderId: order.id } }) : null

  return (
    <>
      {/* recarrega até o webhook confirmar — React eleva o meta para o head */}
      {(pendente || order.status === 'IN_REVIEW') && <meta httpEquiv="refresh" content="5" />}
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Kicker>PEDIDO</Kicker>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="type-display text-3xl md:text-4xl">
            {pendente ? 'Aguardando pagamento' : order.status === 'PAID' ? 'Pagamento confirmado' : 'Pedido'}
          </h1>
          <StatusTag tone={order.status === 'PAID' ? 'ok' : pendente ? 'warn' : 'danger'}>
            {STATUS_LABEL[order.status]}
          </StatusTag>
          {sandbox && <DemoSeal>SANDBOX — PAGAMENTO DE DEMONSTRAÇÃO</DemoSeal>}
        </div>

        <Surface className="mt-8">
          <SurfaceHead>Resumo</SurfaceHead>
          <dl className="p-3">
            <div className="datarow">
              <dt>Pedido</dt>
              <dd className="break-all normal-case">{order.id}</dd>
            </div>
            <div className="datarow">
              <dt>Plano</dt>
              <dd className="normal-case">
                {order.plan.product.name} — {order.plan.name}
              </dd>
            </div>
            <div className="datarow">
              <dt>Total</dt>
              <dd>{formatCents(order.totalCents, order.currency)}</dd>
            </div>
            {payment && (
              <div className="datarow">
                <dt>Método</dt>
                <dd>{payment.method}</dd>
              </div>
            )}
          </dl>
        </Surface>

        {pendente && pix && (
          <Surface className="mt-6">
            <SurfaceHead>PIX copia e cola</SurfaceHead>
            <div className="p-5">
              <p className="type-num break-all rounded-ctl border border-edge bg-void p-4 text-[13px] text-ink-1">{pix}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <CopyButton text={pix} />
                <span className="text-[12px] text-ink-3">
                  Pague no app do seu banco. Esta página atualiza sozinha a cada 5 segundos.
                </span>
              </div>
            </div>
          </Surface>
        )}

        {pendente && !pix && (
          <p className="mt-6 text-[14px] text-ink-2">
            Assim que o pagamento for confirmado pelo provedor, esta página atualiza sozinha.
          </p>
        )}

        {order.status === 'PAID' && (
          <Surface className="mt-6 p-5">
            <p className="text-[15px] font-semibold text-ink-1">✓ Pagamento confirmado. Pedido concluído.</p>
            {order.licenseIntent === 'NEW_INSTALL' && (
              <p className="mt-2 text-[13px]">
                <span className="type-kicker text-ink-1">NOVA CHAVE EMITIDA PARA A NOVA INSTALAÇÃO</span>
                <span className="mt-0.5 block text-ink-3">
                  A licença anterior permanece vinculada à instalação antiga.
                </span>
              </p>
            )}
            {license && (
              <div className="mt-4 border-t border-line pt-4">
                <Kicker>LICENÇA EMITIDA</Kicker>
                <p className="type-num mt-2 text-xl font-bold text-ink-1">{license.keyMasked}</p>
                <p className="mt-1 text-[13px] text-ink-3">
                  A chave completa fica no seu painel, junto com o download do aplicativo.
                </p>
              </div>
            )}
            <Link href="/painel/licenca" className="btn btn--primary mt-5">
              VER MINHA LICENÇA
            </Link>
          </Surface>
        )}

        {!pendente && order.status !== 'PAID' && (
          <Surface className="mt-6 p-5">
            <p className="text-[14px] text-ink-2">
              {order.status === 'CANCELLED' || order.status === 'EXPIRED'
                ? 'O pagamento não foi concluído. Nenhum valor foi cobrado — você pode refazer o pedido.'
                : order.status === 'IN_REVIEW'
                  ? 'O pagamento está em análise pelo provedor. Esta página mostrará o resultado.'
                  : 'Este pedido foi revertido. A licença vinculada a ele foi suspensa.'}
            </p>
            {(order.status === 'CANCELLED' || order.status === 'EXPIRED') && (
              <Link href={refazerHref} className="btn btn--ghost mt-4">
                REFAZER PEDIDO
              </Link>
            )}
          </Surface>
        )}

        {sandbox && pendente && (
          <Surface flat className="mt-8 p-5">
            <DemoSeal>SANDBOX — PAGAMENTO DE DEMONSTRAÇÃO</DemoSeal>
            <p className="mt-3 text-[13px] text-ink-3">
              Ambiente de demonstração: nenhum dinheiro real circula. O botão abaixo envia um webhook
              assinado pelo mesmo caminho usado em produção.
            </p>
            <form action="/api/dev/sandbox" method="post" className="mt-4">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="resultado" value="approved" />
              <button type="submit" className="btn btn--ghost">
                SIMULAR PAGAMENTO APROVADO
              </button>
            </form>
          </Surface>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
