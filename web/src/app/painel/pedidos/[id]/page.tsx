import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { formatCents } from '@/lib/money'
import { BRAND } from '@/lib/brand'
import { Surface, Kicker, RuleFade, StatusTag } from '@/components/ui'
import { ORDER_TAG, PAYMENT_METHOD_LABEL, PAYMENT_TAG, fmtDateTime } from '../../helpers'
import { PrintButton } from './print-button'

export default async function PedidoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const order = await db.order.findUnique({
    where: { id },
    include: { plan: true, payments: { orderBy: { createdAt: 'desc' } }, coupon: true },
  })
  if (!order || order.userId !== user.id) notFound()

  return (
    <div>
      {/* impressão: só o recibo aparece */}
      <style>{`@media print {
        body::after { display: none !important; }
        body * { visibility: hidden; }
        #recibo, #recibo * { visibility: visible; }
        #recibo { position: absolute; left: 0; top: 0; width: 100%; }
        #recibo, #recibo * { background: #fff !important; color: #000 !important; box-shadow: none !important; }
      }`}</style>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>
            <Link href="/painel/pedidos" className="hover:text-ink-1">
              PEDIDOS
            </Link>{' '}
            / DETALHE
          </Kicker>
          <h1 className="type-display text-3xl">Pedido</h1>
          <p className="type-mono mt-1 text-xs text-ink-3">{order.id}</p>
        </div>
        <StatusTag tone={ORDER_TAG[order.status].tone}>{ORDER_TAG[order.status].label}</StatusTag>
      </header>

      <Surface className="p-6">
        <Kicker className="mb-3">ITENS</Kicker>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-ink-1">
            {order.plan.name}
            <span className="type-mono ml-2 text-xs text-ink-3">x1</span>
          </p>
          <p className="type-mono text-ink-1">{formatCents(order.subtotalCents, order.currency)}</p>
        </div>

        <RuleFade className="my-4" />

        <dl className="type-mono space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-3">SUBTOTAL</dt>
            <dd className="text-ink-2">{formatCents(order.subtotalCents, order.currency)}</dd>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-3">
                DESCONTO{order.coupon ? ` (${order.coupon.code})` : ''}
              </dt>
              <dd className="text-ink-2">-{formatCents(order.discountCents, order.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between text-base">
            <dt className="text-ink-1">TOTAL</dt>
            <dd className="font-bold text-ink-1">{formatCents(order.totalCents, order.currency)}</dd>
          </div>
        </dl>

        <p className="type-mono mt-4 text-xs text-ink-3">
          CRIADO EM {fmtDateTime(order.createdAt)}
          {order.paidAt ? ` · PAGO EM ${fmtDateTime(order.paidAt)}` : ''}
        </p>
      </Surface>

      <Surface flat className="mt-6 p-6">
        <Kicker className="mb-3">PAGAMENTOS</Kicker>
        {order.payments.length === 0 ? (
          <p className="text-sm text-ink-3">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="space-y-2">
            {order.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="type-mono text-xs text-ink-3">{fmtDateTime(p.createdAt)}</span>
                <span className="text-ink-2">{PAYMENT_METHOD_LABEL[p.method]}</span>
                <span className="type-mono text-ink-1">{formatCents(p.amountCents, order.currency)}</span>
                <StatusTag tone={PAYMENT_TAG[p.status].tone}>{PAYMENT_TAG[p.status].label}</StatusTag>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <Kicker>RECIBO</Kicker>
          <PrintButton />
        </div>

        <div
          id="recibo"
          className="p-6"
          style={{ background: 'var(--color-carbon)', boxShadow: 'inset 0 0 0 1px var(--color-edge)' }}
        >
          <p className="type-display text-xl">{BRAND.fullName}</p>
          <p className="type-kicker mt-1">RECIBO DE PEDIDO</p>

          <div className="type-mono mt-4 space-y-1 text-sm">
            <p>PEDIDO: {order.id}</p>
            <p>DATA: {fmtDateTime(order.paidAt ?? order.createdAt)}</p>
            <p>
              CLIENTE: {user.name} ({user.email})
            </p>
            <p>ITEM: {order.plan.name} x1</p>
            <p>SUBTOTAL: {formatCents(order.subtotalCents, order.currency)}</p>
            {order.discountCents > 0 && (
              <p>DESCONTO: -{formatCents(order.discountCents, order.currency)}</p>
            )}
            <p>TOTAL: {formatCents(order.totalCents, order.currency)}</p>
            <p>STATUS: {ORDER_TAG[order.status].label}</p>
            {order.payments[0] && <p>PAGAMENTO: {PAYMENT_METHOD_LABEL[order.payments[0].method]}</p>}
          </div>

          <p className="mt-4 text-xs text-ink-3">
            Recibo simples gerado pelo painel — não substitui documento fiscal.
          </p>
        </div>
      </section>
    </div>
  )
}
