import type { Metadata } from 'next'
import Form from 'next/form'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Kicker, Notice, Surface, SurfaceHead } from '@/components/ui'
import { iniciarCompraAction } from '@/lib/actions/checkout'
import { requireUser } from '@/lib/auth'
import { quoteOrder } from '@/lib/checkout'
import { db } from '@/lib/db'
import { getGates } from '@/lib/gates'
import { findLiveLicense } from '@/lib/licensing'
import { formatCents } from '@/lib/money'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'

export const metadata: Metadata = { title: 'Confirmar pedido' }

const METODOS = [
  { value: 'PIX', label: 'PIX', hint: 'Aprovação em minutos' },
  { value: 'CARD', label: 'CARTÃO', hint: 'Crédito, à vista' },
  { value: 'BOLETO', label: 'BOLETO', hint: 'Compensa em até 2 dias úteis' },
] as const

const OPTION =
  'flex cursor-pointer items-center gap-3 rounded-ctl border border-edge bg-void px-3 py-2.5 transition-colors has-[:checked]:border-signal'

export default async function ComprarPage({
  params,
  searchParams,
}: {
  params: Promise<{ plano: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { plano } = await params
  const sp = await searchParams
  const cupom = typeof sp.cupom === 'string' && sp.cupom.trim() ? sp.cupom.trim() : undefined
  const erro = typeof sp.erro === 'string' ? sp.erro : null
  const intentNova = sp.intent === 'nova'

  // login exigido aqui não pode perder a compra — volta para este mesmo checkout
  const voltar = new URLSearchParams()
  if (cupom) voltar.set('cupom', cupom)
  if (intentNova) voltar.set('intent', 'nova')
  const qs = voltar.toString()
  const user = await requireUser(`/comprar/${encodeURIComponent(plano)}${qs ? `?${qs}` : ''}`)

  const [plan, quote, licencaViva, gates] = await Promise.all([
    db.plan.findUnique({ where: { slug: plano }, include: { product: true } }),
    quoteOrder(plano, cupom, user.id),
    findLiveLicense(user.id),
    getGates(),
  ])
  if (!plan || !quote) notFound()

  const features = Array.isArray(plan.features) ? (plan.features as string[]) : []
  const duracao = plan.durationDays === null ? 'VITALÍCIO' : `${plan.durationDays} DIAS`
  const vendasPausadas = gates.maintenanceMode || !gates.checkoutEnabled

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Kicker>CHECKOUT</Kicker>
        <h1 className="type-display mt-2 text-3xl md:text-4xl">Confirmar pedido</h1>

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_420px] md:items-start">
          <Surface>
            <SurfaceHead>Produto</SurfaceHead>
            <div className="p-5">
              <p className="text-xl font-bold text-ink-1">
                {plan.product.name} — {plan.name}
              </p>
              <dl className="mt-4">
                <div className="datarow">
                  <dt>Duração</dt>
                  <dd>{duracao}</dd>
                </div>
                <div className="datarow">
                  <dt>Dispositivos</dt>
                  <dd>{plan.deviceLimit}</dd>
                </div>
              </dl>
              {features.length > 0 && (
                <>
                  <Kicker className="mt-5">INCLUI</Kicker>
                  <ul className="mt-2 space-y-1.5">
                    {features.map((f) => (
                      <li key={f} className="flex gap-2 text-[14px] text-ink-2">
                        <span aria-hidden className="text-ink-1">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Surface>

          <Surface>
            <SurfaceHead>Pagamento</SurfaceHead>
            <div className="p-5">
              {vendasPausadas && (
                <Notice tone="danger" title="Vendas pausadas" role="alert" className="mb-4">
                  <p>
                    As vendas estão temporariamente pausadas. Tente novamente em instantes. Licenças
                    ativas continuam funcionando normalmente.
                  </p>
                </Notice>
              )}

              <div className="datarow">
                <dt>Subtotal</dt>
                <dd>{formatCents(quote.subtotalCents, quote.currency)}</dd>
              </div>

              <Form action={`/comprar/${plano}`} className="mt-4">
                {intentNova && <input type="hidden" name="intent" value="nova" />}
                <label htmlFor="cupom" className="type-kicker mb-1.5 block">
                  CUPOM
                </label>
                <div className="flex gap-2">
                  <input
                    id="cupom"
                    name="cupom"
                    type="text"
                    defaultValue={cupom ?? ''}
                    placeholder="CÓDIGO"
                    className="field uppercase"
                    autoComplete="off"
                  />
                  <button type="submit" className="btn btn--ghost shrink-0">
                    APLICAR
                  </button>
                </div>
              </Form>
              {quote.couponError && (
                <p className="mt-2 text-[13px] text-blood" role="alert">
                  ERRO — {quote.couponError}
                </p>
              )}
              {quote.couponId && (
                <div className="datarow mt-3">
                  <dt>Desconto ({cupom?.toUpperCase()})</dt>
                  <dd>-{formatCents(quote.discountCents, quote.currency)}</dd>
                </div>
              )}

              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                <span className="type-kicker">TOTAL</span>
                <span className="type-num text-3xl font-bold text-ink-1">
                  {formatCents(quote.totalCents, quote.currency)}
                </span>
              </div>

              <form action={iniciarCompraAction.bind(null, plano, cupom)} className="mt-6">
                <fieldset>
                  <legend className="type-kicker mb-2">MÉTODO DE PAGAMENTO</legend>
                  <div className="space-y-2">
                    {METODOS.map((m, i) => (
                      <label key={m.value} className={OPTION}>
                        <input type="radio" name="metodo" value={m.value} defaultChecked={i === 0} required />
                        <span className="text-[12px] font-bold tracking-[0.06em] text-ink-1">{m.label}</span>
                        <span className="ml-auto text-[12px] text-ink-3">{m.hint}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Notice title="Licença por instalação" className="mt-5">
                  <p className="text-ink-1">{AVISO_LICENCA_INSTALACAO}</p>
                  <p className="mt-1.5 text-[12px] text-ink-3">
                    Renovar mantém a instalação atual. Formatou o Windows? Será preciso uma nova licença.
                  </p>
                </Notice>

                {licencaViva ? (
                  <fieldset className="mt-5">
                    <legend className="type-kicker mb-2">O QUE VOCÊ QUER FAZER</legend>
                    <div className="space-y-2">
                      <label className={`${OPTION} items-start`}>
                        <input type="radio" name="intent" value="EXTEND" defaultChecked={!intentNova} required className="mt-1" />
                        <span>
                          <span className="block text-[12px] font-bold tracking-[0.06em] text-ink-1">RENOVAR MINHA LICENÇA</span>
                          <span className="mt-0.5 block text-[12px] text-ink-3">
                            Soma o período à licença atual da instalação vinculada.
                          </span>
                        </span>
                      </label>
                      <label className={`${OPTION} items-start`}>
                        <input type="radio" name="intent" value="NEW_INSTALL" defaultChecked={intentNova} required className="mt-1" />
                        <span>
                          <span className="block text-[12px] font-bold tracking-[0.06em] text-ink-1">NOVA INSTALAÇÃO</span>
                          <span className="mt-0.5 block text-[12px] text-ink-3">
                            Nova chave para Windows formatado ou outro computador; a licença atual não muda.
                          </span>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                ) : (
                  <input type="hidden" name="intent" value="EXTEND" />
                )}

                <label className="mt-5 flex cursor-pointer items-start gap-3">
                  <input type="checkbox" name="aceite_instalacao" required className="mt-0.5 size-4" />
                  <span className="text-[13px] text-ink-2">
                    LI E ENTENDI: a licença vale para a instalação atual do Windows.
                  </span>
                </label>

                {erro && (
                  <p className="mt-4 text-[13px] text-blood" role="alert">
                    ERRO — {erro}
                  </p>
                )}

                <button type="submit" className="btn btn--primary btn--lg mt-5 w-full" disabled={vendasPausadas}>
                  CONFIRMAR
                </button>
              </form>
              <p className="mt-3 text-[12px] text-ink-3">
                O valor é recalculado no servidor na confirmação. Nenhum dado de cartão passa por este site.
              </p>
            </div>
          </Surface>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
