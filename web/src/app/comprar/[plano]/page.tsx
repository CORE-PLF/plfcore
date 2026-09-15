import type { Metadata } from 'next'
import Form from 'next/form'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Chamfer, Kicker, RuleFade } from '@/components/ui'
import { iniciarCompraAction } from '@/lib/actions/checkout'
import { requireUser } from '@/lib/auth'
import { quoteOrder } from '@/lib/checkout'
import { db } from '@/lib/db'
import { getGates } from '@/lib/gates'
import { findLiveLicense } from '@/lib/licensing'
import { formatCents } from '@/lib/money'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'

export const metadata: Metadata = { title: 'CONFIRMAR PEDIDO' }

const METODOS = [
  { value: 'PIX', label: 'PIX', hint: 'Aprovação em minutos' },
  { value: 'CARD', label: 'CARTÃO', hint: 'Crédito, à vista' },
  { value: 'BOLETO', label: 'BOLETO', hint: 'Compensa em até 2 dias úteis' },
] as const

// chanfro 4px do quadrado do checkbox (borda = wrapper, miolo = input com inset 1px)
const CHECK_CLIP =
  'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)'

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
        <h1 className="type-display mt-1 text-4xl text-ink-1">CONFIRMAR PEDIDO</h1>
        <RuleFade className="my-6" />

        <div className="grid gap-6 md:grid-cols-[1fr_400px]">
          <Chamfer cut={8} className="p-6">
            <Kicker>PRODUTO</Kicker>
            <p className="type-display mt-1 text-2xl text-ink-1">
              {plan.product.name} — {plan.name}
            </p>
            <dl className="type-mono mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <dt className="text-ink-3">DURAÇÃO</dt>
              <dd className="text-right text-ink-1">{duracao}</dd>
              <dt className="text-ink-3">DISPOSITIVOS</dt>
              <dd className="text-right text-ink-1">{plan.deviceLimit}</dd>
            </dl>
            {features.length > 0 && (
              <>
                <RuleFade className="my-4" />
                <Kicker>INCLUI</Kicker>
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
          </Chamfer>

          <Chamfer cut={8} className="p-6">
            <Kicker>PAGAMENTO</Kicker>

            {vendasPausadas && (
              <Chamfer cut={6} flat edge="var(--color-heat)" className="mt-4 px-4 py-3" role="alert">
                <p className="type-kicker" style={{ color: 'var(--color-heat)' }}>
                  VENDAS PAUSADAS
                </p>
                <p className="mt-1 text-[13px] text-ink-2">
                  As vendas estão temporariamente pausadas. Tente novamente em instantes. Licenças
                  ativas continuam funcionando normalmente.
                </p>
              </Chamfer>
            )}

            <div className="type-mono mt-4 flex items-baseline justify-between text-[13px]">
              <span className="text-ink-3">SUBTOTAL</span>
              <span className="text-ink-1">{formatCents(quote.subtotalCents, quote.currency)}</span>
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
                  className="field type-mono uppercase"
                  autoComplete="off"
                />
                <button type="submit" className="btn btn--ghost btn--sm chamfer shrink-0 self-center">
                  APLICAR
                </button>
              </div>
            </Form>
            {quote.couponError && (
              <p className="mt-2 text-[13px] text-signal" role="alert">
                ERRO — {quote.couponError}
              </p>
            )}
            {quote.couponId && (
              <div className="type-mono mt-3 flex items-baseline justify-between text-[13px]">
                <span className="text-ink-3">DESCONTO ({cupom?.toUpperCase()})</span>
                <span className="text-ink-1">-{formatCents(quote.discountCents, quote.currency)}</span>
              </div>
            )}

            <RuleFade className="my-4" />
            <div className="flex items-baseline justify-between">
              <span className="type-kicker">TOTAL</span>
              <span className="type-mono text-3xl font-bold text-ink-1">
                {formatCents(quote.totalCents, quote.currency)}
              </span>
            </div>

            <form action={iniciarCompraAction.bind(null, plano, cupom)} className="mt-6">
              <fieldset>
                <legend className="type-kicker mb-2">MÉTODO DE PAGAMENTO</legend>
                <div className="space-y-2">
                  {METODOS.map((m, i) => (
                    <label
                      key={m.value}
                      className="flex cursor-pointer items-center gap-3 border border-line bg-steel px-3 py-2.5 transition-colors has-[:checked]:border-signal"
                    >
                      <input
                        type="radio"
                        name="metodo"
                        value={m.value}
                        defaultChecked={i === 0}
                        required
                        className="accent-[var(--color-signal)]"
                      />
                      <span className="type-kicker text-ink-1">{m.label}</span>
                      <span className="ml-auto text-[12px] text-ink-3">{m.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <Chamfer cut={6} edge="var(--color-heat)" flat className="mt-5 p-4">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="type-mono text-[13px] font-bold" style={{ color: 'var(--color-heat)' }}>
                    [!]
                  </span>
                  <p className="type-kicker" style={{ color: 'var(--color-heat)' }}>
                    LICENÇA POR INSTALAÇÃO
                  </p>
                </div>
                <p className="mt-2 text-[13px] text-ink-1">{AVISO_LICENCA_INSTALACAO}</p>
                <p className="mt-1.5 text-[12px] text-ink-3">
                  Renovar mantém a instalação atual. Formatou o Windows? Será preciso uma nova licença.
                </p>
              </Chamfer>

              {licencaViva ? (
                <fieldset className="mt-5">
                  <legend className="type-kicker mb-2">O QUE VOCÊ QUER FAZER</legend>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-start gap-3 border border-line bg-steel px-3 py-2.5 transition-colors has-[:checked]:border-signal">
                      <input
                        type="radio"
                        name="intent"
                        value="EXTEND"
                        defaultChecked={!intentNova}
                        required
                        className="mt-1 accent-[var(--color-signal)]"
                      />
                      <span>
                        <span className="type-kicker block text-ink-1">RENOVAR MINHA LICENÇA</span>
                        <span className="mt-0.5 block text-[12px] text-ink-3">
                          Soma o período à licença atual da instalação vinculada.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 border border-line bg-steel px-3 py-2.5 transition-colors has-[:checked]:border-signal">
                      <input
                        type="radio"
                        name="intent"
                        value="NEW_INSTALL"
                        defaultChecked={intentNova}
                        required
                        className="mt-1 accent-[var(--color-signal)]"
                      />
                      <span>
                        <span className="type-kicker block text-ink-1">NOVA INSTALAÇÃO</span>
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
                <span
                  className="mt-0.5 block h-5 w-5 shrink-0 bg-edge transition-colors has-[:checked]:bg-signal has-[:focus-visible]:bg-signal"
                  style={{ clipPath: CHECK_CLIP, position: 'relative' }}
                >
                  <input
                    type="checkbox"
                    name="aceite_instalacao"
                    required
                    className="peer absolute inset-px cursor-pointer appearance-none bg-steel"
                    style={{ clipPath: CHECK_CLIP }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 hidden items-center justify-center text-[12px] font-bold leading-none text-signal peer-checked:flex"
                  >
                    ✓
                  </span>
                </span>
                <span className="text-[13px] text-ink-2">
                  LI E ENTENDI: a licença vale para a instalação atual do Windows.
                </span>
              </label>

              {erro && (
                <p className="mt-4 text-[13px] text-signal" role="alert">
                  ERRO — {erro}
                </p>
              )}

              <button type="submit" className="btn btn--primary chamfer mt-5 w-full" disabled={vendasPausadas}>
                CONFIRMAR
              </button>
            </form>
            <p className="mt-3 text-[12px] text-ink-3">
              O valor é recalculado no servidor na confirmação. Nenhum dado de cartão passa por este site.
            </p>
          </Chamfer>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
