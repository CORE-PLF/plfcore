import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { comprarCreditosAction } from '@/lib/actions/revenda'
import { Chamfer, Kicker, RuleFade } from '@/components/ui'
import { requireApprovedReseller } from '../guards'
import { LedgerTable } from '../ledger-table'

export const metadata: Metadata = { title: 'Créditos de revenda' }

const ERROS: Record<string, string> = {
  pack: 'Este pack não está mais disponível. Escolha outro da lista.',
  pagamento: 'Não deu para iniciar o pagamento agora. Tente de novo em instantes.',
}

function creditCentsOf(features: unknown, fallback: number): number {
  if (features && typeof features === 'object' && !Array.isArray(features)) {
    const v = (features as Record<string, unknown>).creditCents
    if (typeof v === 'number' && v > 0) return v
  }
  return fallback
}

export default async function CreditosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { reseller } = await requireApprovedReseller()
  const { erro } = await searchParams

  const [packs, extrato] = await Promise.all([
    db.plan.findMany({
      where: { active: true, product: { slug: 'creditos' }, prices: { some: { active: true, currency: 'BRL' } } },
      include: { prices: { where: { active: true, currency: 'BRL' } } },
      orderBy: { sortOrder: 'asc' },
    }),
    db.resellerLedger.findMany({
      where: { resellerId: reseller.id },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Kicker>CRÉDITOS DE REVENDA</Kicker>
        <h1 className="type-display mt-1 text-4xl">COMPRAR CRÉDITOS</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--color-ink-3)' }}>
          O pagamento aprovado credita o saldo automaticamente. Saldo atual:{' '}
          <span className="type-mono" style={{ color: 'var(--color-ink-1)' }}>
            {formatCents(reseller.creditBalanceCents)}
          </span>
        </p>
      </div>

      {erro && ERROS[erro] && (
        <Chamfer cut={6} edge="var(--color-rust)" className="p-4">
          <p role="alert" className="text-sm" style={{ color: 'var(--color-signal)' }}>
            {ERROS[erro]}
          </p>
        </Chamfer>
      )}

      {packs.length === 0 ? (
        <Chamfer cut={8} className="p-6">
          <p style={{ color: 'var(--color-ink-2)' }}>
            Nenhum pack de créditos disponível no momento. Volte mais tarde ou fale com o suporte.
          </p>
        </Chamfer>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => {
            const priceCents = pack.prices[0].amountCents
            const creditCents = creditCentsOf(pack.features, priceCents)
            const bonus = creditCents - priceCents
            return (
              <Chamfer key={pack.id} cut={8} className="flex flex-col p-5">
                <Kicker>{pack.name}</Kicker>
                <p className="type-mono mt-3 text-3xl" style={{ color: 'var(--color-ink-1)' }}>
                  {formatCents(priceCents)}
                </p>
                <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-2)' }}>
                  Crédito recebido:{' '}
                  <span className="type-mono" style={{ color: 'var(--color-ink-1)' }}>
                    {formatCents(creditCents)}
                  </span>
                </p>
                {bonus > 0 && (
                  <p className="type-mono mt-1 text-xs" style={{ color: 'var(--color-heat)' }}>
                    +{formatCents(bonus)} DE BÔNUS
                  </p>
                )}
                <form action={comprarCreditosAction.bind(null, pack.slug)} className="mt-5">
                  <button type="submit" className="btn btn--primary chamfer w-full">
                    COMPRAR
                  </button>
                </form>
              </Chamfer>
            )
          })}
        </div>
      )}

      <section>
        <h2 className="type-display text-2xl">EXTRATO</h2>
        <RuleFade className="my-4" />
        <LedgerTable entries={extrato} />
      </section>
    </div>
  )
}
