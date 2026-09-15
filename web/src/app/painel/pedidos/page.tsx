import Link from 'next/link'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { formatCents } from '@/lib/money'
import { Chamfer, Kicker, StatusTag } from '@/components/ui'
import { ORDER_TAG, PAYMENT_METHOD_LABEL, fmtDateTime } from '../helpers'

export default async function PedidosPage() {
  const user = await requireUser()
  const orders = await db.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      plan: true,
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      license: { select: { keyMasked: true } },
    },
  })

  return (
    <div>
      <header className="mb-6">
        <Kicker>PAINEL</Kicker>
        <h1 className="type-display text-3xl">PEDIDOS</h1>
      </header>

      {orders.length === 0 ? (
        <Chamfer cut={8} flat className="p-6">
          <p className="text-ink-2">Nenhum pedido até agora.</p>
          <Link href="/planos" className="btn btn--primary chamfer mt-4">
            VER PLANOS
          </Link>
        </Chamfer>
      ) : (
        <Chamfer cut={8} flat className="overflow-x-auto">
          <table className="w-full min-w-190 text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                <th className="type-kicker px-4 py-3 font-normal">DATA</th>
                <th className="type-kicker px-4 py-3 font-normal">PLANO</th>
                <th className="type-kicker px-4 py-3 font-normal">TOTAL</th>
                <th className="type-kicker px-4 py-3 font-normal">MÉTODO</th>
                <th className="type-kicker px-4 py-3 font-normal">STATUS</th>
                <th className="type-kicker px-4 py-3 font-normal">LICENÇA GERADA</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Detalhe</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                  <td className="type-mono px-4 py-3 text-xs text-ink-3">
                    {fmtDateTime(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-ink-1">{order.plan.name}</td>
                  <td className="type-mono px-4 py-3 text-ink-1">
                    {formatCents(order.totalCents, order.currency)}
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {order.payments[0] ? PAYMENT_METHOD_LABEL[order.payments[0].method] : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusTag tone={ORDER_TAG[order.status].tone}>
                      {ORDER_TAG[order.status].label}
                    </StatusTag>
                  </td>
                  <td className="px-4 py-3">
                    {order.license ? (
                      <Link
                        href="/painel/licenca"
                        className="type-mono text-xs text-ink-1 hover:underline"
                      >
                        {order.license.keyMasked}
                      </Link>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/painel/pedidos/${order.id}`} className="btn btn--ghost btn--sm chamfer">
                      DETALHE
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Chamfer>
      )}
    </div>
  )
}
