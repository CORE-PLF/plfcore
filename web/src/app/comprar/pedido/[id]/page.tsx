import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Chamfer, DemoSeal, Kicker, RuleFade, StatusTag } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import type { OrderStatus } from '@/generated/prisma/client'
import { CopyButton } from './copy-button'

export const metadata: Metadata = { title: 'PEDIDO' }

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
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="type-display text-4xl text-ink-1">
            {pendente ? 'AGUARDANDO PAGAMENTO' : order.status === 'PAID' ? 'PAGAMENTO CONFIRMADO' : 'PEDIDO'}
          </h1>
          <StatusTag tone={order.status === 'PAID' ? 'ok' : pendente ? 'warn' : 'danger'}>
            {STATUS_LABEL[order.status]}
          </StatusTag>
          {sandbox && <DemoSeal>SANDBOX — PAGAMENTO DE DEMONSTRAÇÃO</DemoSeal>}
        </div>
        <RuleFade className="my-6" />

        <Chamfer cut={8} className="p-6">
          <dl className="type-mono grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
            <dt className="text-ink-3">PEDIDO</dt>
            <dd className="break-all text-right text-ink-1">{order.id}</dd>
            <dt className="text-ink-3">PLANO</dt>
            <dd className="text-right text-ink-1">
              {order.plan.product.name} — {order.plan.name}
            </dd>
            <dt className="text-ink-3">TOTAL</dt>
            <dd className="text-right text-ink-1">{formatCents(order.totalCents, order.currency)}</dd>
            {payment && (
              <>
                <dt className="text-ink-3">MÉTODO</dt>
                <dd className="text-right text-ink-1">{payment.method}</dd>
              </>
            )}
          </dl>
        </Chamfer>

        {pendente && pix && (
          <Chamfer cut={8} className="mt-6 p-6">
            <Kicker>PIX COPIA E COLA</Kicker>
            <p className="type-mono mt-3 break-all bg-void p-4 text-[13px] text-ink-1">{pix}</p>
            <div className="mt-3 flex items-center gap-3">
              <CopyButton text={pix} />
              <span className="text-[12px] text-ink-3">
                Pague no app do seu banco. Esta página atualiza sozinha a cada 5 segundos.
              </span>
            </div>
          </Chamfer>
        )}

        {pendente && !pix && (
          <p className="mt-6 text-[14px] text-ink-2">
            Assim que o pagamento for confirmado pelo provedor, esta página atualiza sozinha.
          </p>
        )}

        {order.status === 'PAID' && (
          <Chamfer cut={8} className="mt-6 p-6">
            <p className="text-[15px] text-ink-1">✓ Pagamento confirmado. Pedido concluído.</p>
            {order.licenseIntent === 'NEW_INSTALL' && (
              <p className="mt-2 text-[13px]">
                <span className="type-kicker text-ink-1">NOVA CHAVE EMITIDA PARA A NOVA INSTALAÇÃO</span>
                <span className="mt-0.5 block text-ink-3">
                  A licença anterior permanece vinculada à instalação antiga.
                </span>
              </p>
            )}
            {license && (
              <>
                <RuleFade className="my-4" />
                <Kicker>LICENÇA EMITIDA</Kicker>
                <p className="type-mono mt-2 text-xl text-ink-1">{license.keyMasked}</p>
                <p className="mt-1 text-[13px] text-ink-3">
                  A chave completa fica no seu painel, junto com o download do aplicativo.
                </p>
              </>
            )}
            <Link href="/painel/licenca" className="btn btn--primary chamfer mt-5">
              VER MINHA LICENÇA
            </Link>
          </Chamfer>
        )}

        {!pendente && order.status !== 'PAID' && (
          <Chamfer cut={8} className="mt-6 p-6">
            <p className="text-[14px] text-ink-2">
              {order.status === 'CANCELLED' || order.status === 'EXPIRED'
                ? 'O pagamento não foi concluído. Nenhum valor foi cobrado — você pode refazer o pedido.'
                : order.status === 'IN_REVIEW'
                  ? 'O pagamento está em análise pelo provedor. Esta página mostrará o resultado.'
                  : 'Este pedido foi revertido. A licença vinculada a ele foi suspensa.'}
            </p>
            {(order.status === 'CANCELLED' || order.status === 'EXPIRED') && (
              <Link href={refazerHref} className="btn btn--ghost chamfer mt-4">
                REFAZER PEDIDO
              </Link>
            )}
          </Chamfer>
        )}

        {sandbox && pendente && (
          <>
            <RuleFade className="my-8" />
            <Chamfer cut={6} flat className="p-6">
              <div className="flex flex-wrap items-center gap-3">
                <DemoSeal>SANDBOX — PAGAMENTO DE DEMONSTRAÇÃO</DemoSeal>
              </div>
              <p className="mt-3 text-[13px] text-ink-3">
                Ambiente de demonstração: nenhum dinheiro real circula. O botão abaixo envia um webhook
                assinado pelo mesmo caminho usado em produção.
              </p>
              <form action="/api/dev/sandbox" method="post" className="mt-4">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="resultado" value="approved" />
                <button type="submit" className="btn btn--ghost chamfer">
                  SIMULAR PAGAMENTO APROVADO
                </button>
              </form>
            </Chamfer>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
