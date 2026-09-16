import type { Metadata } from 'next'
import Link from 'next/link'
import { Kicker, Notice, Surface } from '@/components/ui'
import { formatCents } from '@/lib/money'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'
import { getPlans } from '../../(publico)/_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Planos' }

export default async function PainelPlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>
}) {
  const [plans, params] = await Promise.all([getPlans(), searchParams])
  const novaInstalacao = params.intent === 'nova'
  const query = novaInstalacao ? '?intent=nova' : ''

  return (
    <div>
      <header className="mb-6">
        <Kicker>COMPRAR</Kicker>
        <h1 className="type-display text-3xl">Planos</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-3">
          Mesmo app em todos. Muda a duração. Uma licença vale para 1 instalação do Windows.
        </p>
      </header>

      {novaInstalacao && (
        <Notice title="Nova instalação" className="mb-6">
          <p>Será emitida uma chave nova. A licença atual continua como está.</p>
        </Notice>
      )}

      {plans.length === 0 ? (
        <Surface flat className="p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-3">
            Nenhum plano disponível no momento.
          </p>
          <p className="mt-2 text-sm text-ink-3">
            As vendas voltam em instantes. Licenças ativas continuam funcionando.
          </p>
        </Surface>
      ) : (
        <div className="grid gap-px border border-line bg-line md:grid-cols-3">
          {plans.map((plan) => {
            const price = plan.prices[0]
            if (!price) return null
            const destaque = plan.featured
            const valor = formatCents(price.amountCents).replace('R$', '').trim()
            const duracao = plan.durationDays === null ? 'Sem expiração' : `${plan.durationDays} dias`
            const instalacoes = plan.deviceLimit === 1 ? '1 instalação' : `${plan.deviceLimit} instalações`
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col px-6 pb-7 pt-8 transition-colors ${
                  destaque ? 'bg-signal hover:bg-[#ffef2e]' : 'bg-carbon hover:bg-surface-2'
                }`}
              >
                {destaque && <div className="hazard-bar absolute inset-x-0 top-0" aria-hidden />}
                <p
                  className={`text-[10.5px] font-black uppercase tracking-[0.22em] ${
                    destaque ? 'text-void/70' : 'text-ink-3'
                  }`}
                >
                  {plan.name}
                  {destaque && ' · recomendado'}
                </p>
                <p className={`type-num mt-5 flex items-end gap-1.5 ${destaque ? 'text-void' : 'text-ink-1'}`}>
                  <span className="text-sm font-bold opacity-55">R$</span>
                  <span className="text-[2.8rem] font-black leading-[0.85] tracking-[-0.05em]">{valor}</span>
                </p>
                <p
                  className={`mt-3 text-[10.5px] font-extrabold uppercase tracking-[0.16em] ${
                    destaque ? 'text-void/70' : 'text-ink-3'
                  }`}
                >
                  {duracao} · {instalacoes}
                </p>
                <Link
                  href={`/comprar/${plan.slug}${query}`}
                  className={`btn mt-6 w-full ${destaque ? 'btn--inverse' : 'btn--ghost'}`}
                >
                  COMPRAR
                </Link>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-5 max-w-2xl text-[13px] leading-[1.65] text-ink-3">
        {AVISO_LICENCA_INSTALACAO} Renovar mantém a instalação atual. A regra aparece de novo, com
        confirmação, antes do pagamento.
      </p>
    </div>
  )
}
