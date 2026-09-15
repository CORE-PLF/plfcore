import type { ResellerLedger } from '@/generated/prisma/client'
import { formatCents } from '@/lib/money'
import { fmtDateTime } from './guards'

export const LEDGER_LABEL: Record<ResellerLedger['type'], string> = {
  CREDIT_PURCHASE: 'COMPRA DE CRÉDITOS',
  LICENSE_ISSUE: 'EMISSÃO DE LICENÇA',
  REFUND: 'REEMBOLSO',
  ADMIN_ADJUST: 'AJUSTE ADMIN',
}

// Entrada (delta positivo) em ink-1, saída em signal — e o sinal +/- sempre
// visível: estado nunca só por cor.
export function LedgerTable({ entries }: { entries: ResellerLedger[] }) {
  if (entries.length === 0)
    return <p className="text-sm" style={{ color: 'var(--color-ink-3)' }}>Nenhuma movimentação registrada.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
            <th className="type-kicker py-2 pr-4 font-bold">DATA</th>
            <th className="type-kicker py-2 pr-4 font-bold">TIPO</th>
            <th className="type-kicker py-2 pr-4 font-bold">NOTA</th>
            <th className="type-kicker py-2 pr-4 text-right font-bold">MOVIMENTO</th>
            <th className="type-kicker py-2 text-right font-bold">SALDO APÓS</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b" style={{ borderColor: 'var(--color-line)' }}>
              <td className="type-mono whitespace-nowrap py-2.5 pr-4" style={{ color: 'var(--color-ink-3)' }}>
                {fmtDateTime(e.createdAt)}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-4" style={{ color: 'var(--color-ink-2)' }}>
                {LEDGER_LABEL[e.type]}
              </td>
              <td className="max-w-56 truncate py-2.5 pr-4" style={{ color: 'var(--color-ink-3)' }}>
                {e.note ?? '—'}
              </td>
              <td
                className="type-mono whitespace-nowrap py-2.5 pr-4 text-right"
                style={{ color: e.deltaCents >= 0 ? 'var(--color-ink-1)' : 'var(--color-signal)' }}
              >
                {e.deltaCents >= 0 ? `+${formatCents(e.deltaCents)}` : formatCents(e.deltaCents)}
              </td>
              <td className="type-mono whitespace-nowrap py-2.5 text-right" style={{ color: 'var(--color-ink-2)' }}>
                {formatCents(e.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
