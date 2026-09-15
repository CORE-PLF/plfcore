import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { reprocessPaymentEventAction } from '@/lib/actions/admin'
import { StatusTag } from '@/components/ui'
import { Flash, PageTitle, Table, Td, fmtDate, toneFor, type SP } from '../../_ui'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Webhooks' }

// Webhooks com problema: eventos de pagamento com erro de processamento e
// entregas de webhook de revendedor que falharam. Assinatura inválida não gera
// PaymentEvent (rejeitada na porta) — o que aparece aqui JÁ passou na assinatura.
export default async function AdminWebhooksPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams

  const [failedEvents, unprocessed, resellerFailed] = await Promise.all([
    db.paymentEvent.findMany({
      where: { error: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { payment: { select: { orderId: true } } },
    }),
    db.paymentEvent.count({ where: { processedAt: null, error: null } }),
    db.webhookDelivery.findMany({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ])

  return (
    <>
      <PageTitle kicker="OPERAÇÃO" title="WEBHOOKS" />
      <Flash sp={sp} />

      <p className="type-mono mb-6 text-[11px] text-ink-3">
        EVENTOS AINDA NÃO PROCESSADOS (SEM ERRO): {unprocessed} — normal ser 0; crescendo = investigar.
      </p>

      <h2 className="type-kicker mb-2">PAGAMENTOS — EVENTOS COM ERRO</h2>
      {failedEvents.length === 0 ? (
        <p className="type-mono mb-8 text-[12px] text-ink-3">Nenhum evento de pagamento com erro.</p>
      ) : (
        <div className="mb-8">
          <Table head={['EVENTO', 'TIPO', 'PROVEDOR', 'ERRO', 'RECEBIDO', '']}>
            {failedEvents.map((e) => (
              <tr key={e.id}>
                <Td>
                  {e.payment?.orderId ? (
                    <Link href={`/admin/pedidos/${e.payment.orderId}`} className="underline">
                      {e.eventId}
                    </Link>
                  ) : (
                    e.eventId
                  )}
                </Td>
                <Td>{e.type}</Td>
                <Td>{e.provider}</Td>
                <Td className="max-w-[360px] whitespace-normal">
                  <span className="text-signal">{e.error?.slice(0, 300)}</span>
                </Td>
                <Td>{fmtDate(e.createdAt)}</Td>
                <Td>
                  <form action={reprocessPaymentEventAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="back" value="/admin/webhooks" />
                    <button type="submit" className="btn btn--ghost btn--sm chamfer">
                      REPROCESSAR
                    </button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <h2 className="type-kicker mb-2">REVENDEDORES — ENTREGAS COM FALHA</h2>
      {resellerFailed.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhuma entrega de webhook de revenda com falha.</p>
      ) : (
        <Table head={['REVENDEDOR', 'EVENTO', 'TENTATIVAS', 'ÚLTIMA TENTATIVA', 'STATUS']}>
          {resellerFailed.map((w) => (
            <tr key={w.id}>
              <Td>
                <Link href={`/admin/revendedores/${w.resellerId}`} className="underline">
                  {w.resellerId}
                </Link>
              </Td>
              <Td>{w.event}</Td>
              <Td>{w.attempts}</Td>
              <Td>{fmtDate(w.lastAttemptAt)}</Td>
              <Td>
                <StatusTag tone={toneFor(w.status)}>{w.status}</StatusTag>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <p className="type-mono mt-2 text-[11px] text-ink-3">
        O retry das entregas de revenda é automático (fila com backoff). FAILED persistente = URL do
        revendedor fora do ar ou bloqueada.
      </p>
    </>
  )
}
