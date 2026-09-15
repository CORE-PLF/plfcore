import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { hasStaffRole, requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { refundOrderAction, reprocessPaymentEventAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { DangerZone, Flash, ReasonInput, Table, Td, fmtDate, toneFor, type SP } from '../../../_ui'

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  const staff = await requireStaff('SUPPORT')
  const { id } = await params
  const sp = await searchParams

  const order = await db.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      plan: { select: { name: true, slug: true } },
      coupon: { select: { code: true } },
      affiliate: { select: { id: true, code: true } },
      license: { select: { id: true, keyMasked: true, status: true } },
      commission: { select: { id: true, amountCents: true, status: true } },
      payments: { include: { events: { orderBy: { createdAt: 'desc' } } }, orderBy: { createdAt: 'desc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!order) notFound()
  const isAdmin = hasStaffRole(staff, 'ADMIN')
  const backPath = `/admin/pedidos/${order.id}`

  const info: [string, ReactNode][] = [
    ['PEDIDO', order.id],
    ['CLIENTE', <Link key="u" href={`/admin/usuarios/${order.user.id}`} className="text-ink-1 underline">{order.user.email}</Link>],
    ['PLANO', `${order.plan.name} (${order.plan.slug})`],
    ['SUBTOTAL', formatCents(order.subtotalCents, order.currency)],
    ['DESCONTO', formatCents(order.discountCents, order.currency)],
    ['TOTAL', <span key="t" className="text-ink-1">{formatCents(order.totalCents, order.currency)}</span>],
    ['CUPOM', order.coupon?.code ?? '—'],
    ['AFILIADO', order.affiliate ? <Link key="a" href={`/admin/afiliados/${order.affiliate.id}`} className="underline">{order.affiliate.code}</Link> : '—'],
    ['COMISSÃO', order.commission ? `${formatCents(order.commission.amountCents)} — ${order.commission.status}` : '—'],
    ['LICENÇA', order.license ? <Link key="l" href={`/admin/licencas/${order.license.id}`} className="underline">{order.license.keyMasked} ({order.license.status})</Link> : '—'],
    ['PROVEDOR', order.provider ? `${order.provider} — ${order.providerRef ?? ''}` : '—'],
    ['CRIADO', fmtDate(order.createdAt)],
    ['PAGO EM', fmtDate(order.paidAt)],
  ]

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/pedidos" className="underline">PEDIDOS</Link> / DETALHE
        </p>
        <h1 className="type-display mt-1 flex flex-wrap items-center gap-3 text-3xl">
          PEDIDO <StatusTag tone={toneFor(order.status)}>{order.status}</StatusTag>
        </h1>
      </header>
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Chamfer cut={8} className="p-4">
            <dl className="type-mono grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
              {info.map(([k, v]) => (
                <div key={k}>
                  <dt className="type-kicker">{k}</dt>
                  <dd className="mt-0.5 break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </Chamfer>

          <section>
            <h2 className="type-kicker mb-3">PAGAMENTOS</h2>
            {order.payments.length === 0 ? (
              <p className="type-mono text-[12px] text-ink-3">Nenhum pagamento registrado.</p>
            ) : (
              order.payments.map((p) => (
                <Chamfer key={p.id} cut={6} className="mb-3 p-4">
                  <div className="type-mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                    <StatusTag tone={toneFor(p.status)}>{p.status}</StatusTag>
                    <span>{p.method}</span>
                    <span className="text-ink-1">{formatCents(p.amountCents)}</span>
                    <span className="text-ink-3">{p.provider} — {p.providerPaymentId ?? 'sem id'}</span>
                    <span className="text-ink-3">{fmtDate(p.createdAt)}</span>
                  </div>
                  {p.events.length > 0 ? (
                    <div className="mt-3">
                      <Table head={['EVENTO', 'TIPO', 'ASSINATURA', 'PROCESSADO', 'ERRO', '']}>
                        {p.events.map((e) => (
                          <tr key={e.id}>
                            <Td>{e.eventId}</Td>
                            <Td>{e.type}</Td>
                            <Td>{e.signatureValid ? 'VÁLIDA' : <span className="text-signal">INVÁLIDA</span>}</Td>
                            <Td>{fmtDate(e.processedAt)}</Td>
                            <Td className="max-w-[220px] whitespace-normal">
                              {e.error ? <span className="text-signal">{e.error}</span> : '—'}
                            </Td>
                            <Td>
                              {isAdmin && e.error ? (
                                <form action={reprocessPaymentEventAction}>
                                  <input type="hidden" name="id" value={e.id} />
                                  <input type="hidden" name="back" value={backPath} />
                                  <button type="submit" className="btn btn--ghost btn--sm chamfer">
                                    REPROCESSAR
                                  </button>
                                </form>
                              ) : null}
                            </Td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  ) : null}
                </Chamfer>
              ))
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {order.refunds.length > 0 && (
            <Chamfer cut={6} className="p-4">
              <h2 className="type-kicker mb-2">REEMBOLSOS</h2>
              {order.refunds.map((r) => (
                <div key={r.id} className="type-mono mb-2 space-y-1 text-[12px]">
                  <p className="flex flex-wrap items-center gap-2">
                    <StatusTag tone={toneFor(r.status)}>{r.status}</StatusTag>
                    <span className="text-ink-1">{formatCents(r.amountCents)}</span>
                    <span className="text-ink-3">{fmtDate(r.createdAt)}</span>
                  </p>
                  <p className="text-ink-3">
                    {r.provider} — {r.providerRefundId ?? 'sem id do provedor'}
                  </p>
                  {r.error ? <p className="text-signal">{r.error}</p> : null}
                </div>
              ))}
            </Chamfer>
          )}

          {isAdmin && (order.status === 'PAID' || order.status === 'REFUND_FAILED') ? (
            <DangerZone summary={order.status === 'REFUND_FAILED' ? 'TENTAR REEMBOLSO DE NOVO' : 'REEMBOLSAR PEDIDO'}>
              <p className="text-[13px] text-ink-2">
                O reembolso é solicitado à API real do provedor ({order.provider ?? 'provedor do pagamento'}).
                Confirmado, o pedido vira REEMBOLSADO, a licença é suspensa e a comissão de afiliado é cancelada.
                Ação registrada na auditoria.
              </p>
              <form action={refundOrderAction} className="space-y-2">
                <input type="hidden" name="id" value={order.id} />
                <ReasonInput placeholder="Motivo do reembolso (obrigatório)" />
                <input
                  name="totp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  placeholder="Código 2FA (6 dígitos)"
                  aria-label="Código 2FA de 6 dígitos"
                  className="field type-mono"
                  autoComplete="one-time-code"
                />
                <button type="submit" className="btn btn--danger chamfer w-full">
                  {order.status === 'REFUND_FAILED' ? 'TENTAR DE NOVO' : 'CONFIRMAR REEMBOLSO'}
                </button>
              </form>
            </DangerZone>
          ) : null}
          {isAdmin && order.status === 'REFUND_PENDING' ? (
            <Chamfer cut={6} flat className="p-4">
              <p className="type-kicker mb-1">REEMBOLSO EM PROCESSAMENTO</p>
              <p className="text-[13px] text-ink-2">
                Aguardando confirmação do provedor via webhook. Nada a fazer aqui — se demorar mais
                de 24h, confira os WEBHOOKS e o painel do provedor.
              </p>
            </Chamfer>
          ) : null}
          {!isAdmin ? (
            <p className="type-mono text-[11px] text-ink-3">Somente leitura — ações exigem papel ADMIN.</p>
          ) : null}
        </aside>
      </div>
    </>
  )
}
