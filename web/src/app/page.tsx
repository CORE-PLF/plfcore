import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Chamfer, RuleFade } from '@/components/ui'
import { BRAND } from '@/lib/brand'
import { formatCents } from '@/lib/money'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'
import { getPlans } from './(publico)/_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'RESYNC — Diagnóstico e otimização do Windows com dados reais' },
  description:
    'A Resync lê CPU, GPU, RAM, discos e, quando o hardware expõe, temperaturas do seu Windows. Cada recomendação é explicada e toda alteração fica registrada, com antes e depois medidos. Licença no painel, pagamento por PIX, cartão ou boleto.',
  openGraph: {
    title: 'RESYNC — A gente não finge que seu PC tem um problema. A gente mostra.',
    description:
      'Diagnóstico e otimização do Windows com dados reais, alterações explicadas e antes e depois medidos.',
    images: [{ url: '/app/app-cockpit.png', width: 1440, height: 900, alt: 'Cockpit do aplicativo Resync' }],
  },
}

// ===== conteúdo real (fonte: app) =====

const DATA_SOURCES: [string, string][] = [
  ['CPU, clocks e núcleos', 'WMI / contadores do Windows'],
  ['GPU NVIDIA, VRAM e temperatura', 'NVIDIA-SMI'],
  ['RAM, discos e inventário', 'WMI'],
  ['Temperaturas', 'sensores do hardware, quando expostos'],
]

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>
}) {
  const [plans, params] = await Promise.all([getPlans(), searchParams])
  const novaInstalacao = params.intent === 'nova'
  const comprarQuery = novaInstalacao ? '?intent=nova' : ''

  const prices = plans
    .map((p) => p.prices[0]?.amountCents)
    .filter((v): v is number => typeof v === 'number')
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Resync',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Windows 10, Windows 11',
      description:
        'Diagnóstico e otimização do Windows com dados reais, alterações explicadas e registradas — reversão quando o Windows permite.',
      offers:
        prices.length > 0
          ? {
              '@type': 'AggregateOffer',
              priceCurrency: 'BRL',
              lowPrice: (Math.min(...prices) / 100).toFixed(2),
              highPrice: (Math.max(...prices) / 100).toFixed(2),
              offerCount: prices.length,
            }
          : undefined,
    },
  ]

  return (
    <>
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="flex-1">
        {/* ================= HERO ================= */}
        <section className="stage-grid border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-14 md:pt-20">
            <div className="max-w-3xl">
              <h1 className="type-display text-[2.6rem] leading-none sm:text-6xl md:text-7xl">
                A gente não finge que seu PC tem um problema.{' '}
                <span className="text-signal">A gente mostra.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base text-ink-2">
                A {BRAND.name} lê dados reais do seu Windows, explica o que encontrou e registra
                cada alteração. Antes e depois medidos na sua máquina — não prometidos em um
                anúncio.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <a href="#planos" className="btn btn--primary chamfer">
                  ESCOLHER MEU PLANO
                </a>
                <a href="#produto" className="btn btn--ghost chamfer">
                  VER O APP FUNCIONANDO
                </a>
              </div>
              <p className="type-mono mt-5 text-[11px] uppercase tracking-widest text-ink-4">
                Windows 10 e 11 · Dados locais · Mudanças explicadas · 7 dias para reembolso
              </p>
            </div>

            {/* captura real do app com anotações técnicas */}
            <div className="relative mt-10 md:mt-14">
              <Chamfer cut={12} flat className="p-1.5 sm:p-2">
                <Image
                  src="/app/app-cockpit.png"
                  alt="Cockpit do aplicativo Resync: relógios de CPU, GPU e RAM, telemetria de 60 segundos e prova real — em modo de demonstração"
                  width={1440}
                  height={900}
                  priority
                  sizes="(max-width: 1152px) 100vw, 1120px"
                  className="h-auto w-full"
                />
              </Chamfer>
              <p className="type-mono mt-3 text-[11px] text-ink-4">
                Selo declarado · fonte medida · estado anterior salvo — interface real do
                aplicativo em modo de demonstração.
              </p>
            </div>
          </div>
        </section>

        {/* ================= MANIFESTO + PRODUTO ================= */}
        <section id="produto" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <h2 className="type-display max-w-3xl text-3xl sm:text-4xl md:text-5xl">
              Não é mais um <span className="text-signal">sabor de otimização.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-ink-2">
              Escolher uma foto de mouse, clicar em um preset e ver uma barra chegar a 100% não
              prova que alguma coisa melhorou. A Resync mostra a origem dos dados, o que
              pretende alterar e o resultado medido depois.
            </p>

            <div className="mt-10 grid gap-8 border-t border-line pt-8 md:grid-cols-2 md:gap-0">
              <div className="md:pr-10">
                <p className="type-mono text-[11px] uppercase tracking-widest text-ink-4">
                  O jeito genérico
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-ink-3">
                  <li>Perfil ou preset sem explicação.</li>
                  <li>Número sem fonte.</li>
                  <li>Alteração escondida atrás de uma barra de progresso.</li>
                  <li>Resultado prometido, nunca medido.</li>
                </ul>
              </div>
              <div className="border-line md:border-l md:pl-10">
                <p className="type-mono text-[11px] uppercase tracking-widest text-signal">
                  O jeito Resync
                </p>
                <ul className="mt-4 space-y-2.5 text-sm text-ink-1">
                  <li>Leitura real, com a fonte declarada na tela.</li>
                  <li>Confirmação antes de qualquer mudança.</li>
                  <li>Registro de tudo no LOG, com estado anterior.</li>
                  <li>Nova medição depois, para comparar.</li>
                </ul>
              </div>
            </div>

            {/* ===== três capítulos com capturas reais ===== */}
            <div className="mt-20 space-y-20 md:mt-28 md:space-y-28">
              {/* VER */}
              <div className="grid items-center gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
                <Chamfer cut={8} flat className="order-1 p-1.5">
                  <Image
                    src="/app/app-raiox.png"
                    alt="Tela Raio-X do Resync: blueprint da placa-mãe com varredura e inventário de processador e placa-mãe"
                    width={1440}
                    height={900}
                    sizes="(max-width: 1024px) 100vw, 640px"
                    className="h-auto w-full"
                  />
                </Chamfer>
                <div className="order-2">
                  <p className="type-mono text-sm text-signal">01 / VER</p>
                  <h3 className="mt-2 text-2xl font-bold text-ink-1">A máquina inteira, com fonte</h3>
                  <p className="mt-3 text-sm text-ink-2">
                    Inventário de processador, placa-mãe, memória, discos e GPU, mais uso e
                    temperaturas ao vivo. Cada leitura diz de onde veio.
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-ink-2">
                    <li className="border-l-2 border-signal pl-3">
                      Sem fonte para um dado? O campo diz <span className="type-mono text-ink-1">NÃO DISPONÍVEL</span> —
                      na captura acima, o serial da BIOS aparece exatamente assim.
                    </li>
                    <li className="border-l-2 border-line pl-3">
                      Nada de contagem de “problemas críticos” para assustar.
                    </li>
                  </ul>
                </div>
              </div>

              {/* DECIDIR */}
              <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.25fr] lg:gap-14">
                <div className="order-2 lg:order-1">
                  <p className="type-mono text-sm text-signal">02 / DECIDIR</p>
                  <h3 className="mt-2 text-2xl font-bold text-ink-1">Você vê a lista antes de aplicar</h3>
                  <p className="mt-3 text-sm text-ink-2">
                    Limpeza usa caminhos temporários conhecidos e mostra o que vai remover. As
                    otimizações do Windows listam o que muda — plano de energia, Game Mode,
                    efeitos visuais, apps em segundo plano — e esperam a sua confirmação.
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-ink-2">
                    <li className="border-l-2 border-signal pl-3">
                      Limites de segurança declarados na tela: Defender, firewall, Windows Update,
                      serviços críticos e drivers ficam fora, sempre.
                    </li>
                    <li className="border-l-2 border-line pl-3">
                      Downloads, documentos, fotos e saves são zona protegida da limpeza.
                    </li>
                  </ul>
                </div>
                <Chamfer cut={8} flat className="order-1 p-1.5 lg:order-2">
                  <Image
                    src="/app/app-windows.png"
                    alt="Tela de otimização do Windows no Resync: lista do que muda e limites de segurança declarados"
                    width={1440}
                    height={900}
                    sizes="(max-width: 1024px) 100vw, 640px"
                    className="h-auto w-full"
                  />
                </Chamfer>
              </div>

              {/* PROVAR */}
              <div className="grid items-center gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
                <Chamfer cut={8} flat className="order-1 p-1.5">
                  <Image
                    src="/app/app-resync.png"
                    alt="LOG do aplicativo: ações aplicadas com data, detalhes de cada alteração e botão de reverter"
                    width={1440}
                    height={620}
                    sizes="(max-width: 1024px) 100vw, 640px"
                    className="h-auto w-full"
                  />
                </Chamfer>
                <div className="order-2">
                  <p className="type-mono text-sm text-signal">03 / PROVAR</p>
                  <h3 className="mt-2 text-2xl font-bold text-ink-1">Tudo registrado, reversível quando o Windows permite</h3>
                  <p className="mt-3 text-sm text-ink-2">
                    Cada ação vira um registro no LOG: o que rodou, quando, com que
                    resultado e com o estado anterior salvo. Depois, uma nova leitura mostra o que
                    realmente mudou.
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-ink-2">
                    <li className="border-l-2 border-signal pl-3">
                      Botão <span className="type-mono text-ink-1">REVERTER</span> item a item, direto no registro.
                    </li>
                    <li className="border-l-2 border-line pl-3">Log exportável — o histórico é seu.</li>
                  </ul>
                </div>
              </div>
            </div>

            <p className="type-mono mt-12 text-[11px] text-ink-4">
              Capturas da interface real do aplicativo em modo de demonstração — o selo aparece na
              própria tela. No seu PC, os números são os da sua máquina.
            </p>
          </div>
        </section>

        {/* ================= COMO FUNCIONA ================= */}
        <section id="como-funciona" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <h2 className="text-2xl font-bold text-ink-1 md:text-3xl">Como funciona</h2>

            <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
              {[
                {
                  n: '01',
                  t: 'MEDIR',
                  d: 'A Resync lê os dados disponíveis e informa a fonte. Se não conseguir medir, ela não preenche o espaço com um número inventado.',
                },
                {
                  n: '02',
                  t: 'ENTENDER E ESCOLHER',
                  d: 'Cada recomendação explica o que muda, o efeito esperado e o risco. Você decide o que executar.',
                },
                {
                  n: '03',
                  t: 'REGISTRAR E COMPARAR',
                  d: 'O estado anterior fica salvo no LOG. Depois da ação, o aplicativo mede de novo para mostrar o que realmente mudou.',
                },
              ].map((fase) => (
                <li key={fase.n} className="relative border-l-2 border-line pl-5 md:border-l-0 md:border-t-2 md:pl-0 md:pt-5">
                  <span
                    aria-hidden
                    className="absolute -left-[5px] top-0 block h-2 w-2 bg-signal md:-top-[5px] md:left-0"
                  />
                  <h3 className="font-bold text-ink-1">{fase.t}</h3>
                  <p className="mt-2 text-sm text-ink-2">{fase.d}</p>
                </li>
              ))}
            </ol>

            <RuleFade className="mt-14" />
            <p className="type-mono mt-8 text-sm text-ink-2">
              Escolha o plano <span className="text-signal">→</span> entre ou crie sua conta{' '}
              <span className="text-signal">→</span> pague <span className="text-signal">→</span>{' '}
              receba a licença no painel <span className="text-signal">→</span> baixe e ative.
            </p>
            <p className="mt-3 text-sm text-ink-3">
              Discord é opcional. Sua licença sempre fica disponível no painel.
            </p>
          </div>
        </section>

        {/* ================= TRANSPARÊNCIA ================= */}
        <section id="transparencia" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <h2 className="type-display text-3xl sm:text-4xl">
              Se está na tela, <span className="text-signal">tem fonte.</span>
            </h2>

            <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
              <div>
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-edge">
                      <th scope="col" className="type-mono py-2 pr-4 text-[11px] font-normal uppercase tracking-widest text-ink-4">
                        Leitura
                      </th>
                      <th scope="col" className="type-mono py-2 text-[11px] font-normal uppercase tracking-widest text-ink-4">
                        Fonte
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {DATA_SOURCES.map(([leitura, fonte]) => (
                      <tr key={leitura} className="border-b border-line">
                        <td className="py-2.5 pr-4 text-ink-1">{leitura}</td>
                        <td className="type-mono py-2.5 text-ink-2">{fonte}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mt-8 text-sm font-bold text-ink-1">Limitações, sem esconder</p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink-3">
                  <li>Nem todo hardware expõe temperatura.</li>
                  <li>Leituras instantâneas podem refletir picos.</li>
                  <li>GPUs não NVIDIA podem ter dados mais limitados.</li>
                  <li>Algumas funções exigem privilégio de administrador.</li>
                </ul>
                <p className="mt-4 text-sm text-ink-3">
                  Benchmarks só serão publicados quando existirem medições reais seguindo a{' '}
                  metodologia declarada. Hoje não há benchmarks publicados.
                </p>
              </div>

              <div className="space-y-8">
                <div>
                  <p className="text-sm font-bold text-ink-1">O que não coletamos</p>
                  <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                    <li>Arquivos pessoais.</li>
                    <li>Histórico de navegação.</li>
                    <li>Senhas ou teclas digitadas.</li>
                    <li>Capturas da sua atividade.</li>
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-bold text-ink-1">O que vai ao servidor</p>
                  <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                    <li>Dados de conta, compra e validação da licença.</li>
                    <li>Chave, identificador da instalação e versão do app.</li>
                  </ul>
                  <p className="mt-3 text-sm text-ink-3">
                    As leituras do seu hardware ficam na sua máquina.{' '}
                    <Link href="/legal/privacidade" className="text-ink-1 underline">
                      Política de privacidade completa
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= PLANOS ================= */}
        <section id="planos" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <h2 className="type-display text-3xl sm:text-4xl">Planos</h2>
            <p className="mt-3 max-w-2xl text-sm text-ink-2">
              O aplicativo é o mesmo em todos os planos — muda a duração e o limite de instalações.
            </p>
            {novaInstalacao && (
              <p className="type-mono mt-4 inline-block border-l-2 border-heat pl-3 text-[12px] uppercase tracking-wider text-heat">
                Compra para NOVA INSTALAÇÃO — será emitida uma chave nova
              </p>
            )}

            <div className="mt-8">
              {plans.map((plan) => {
                const price = plan.prices[0]
                if (!price) return null
                const destaque = plan.featured
                return (
                  <div
                    key={plan.id}
                    className={`space-y-3 border-b border-line px-3 py-4 sm:grid sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center sm:gap-4 sm:space-y-0 ${
                      destaque ? 'bg-steel' : ''
                    }`}
                    style={destaque ? { boxShadow: 'inset 2px 0 0 var(--color-signal)' } : undefined}
                  >
                    <div>
                      <p className="font-bold text-ink-1">
                        {plan.name}
                        {destaque && (
                          <span className="type-mono ml-2 text-[10px] uppercase tracking-widest text-signal">
                            recomendado
                          </span>
                        )}
                      </p>
                      <p className="type-mono mt-0.5 text-[11px] text-ink-4">
                        {plan.durationDays === null ? 'sem expiração' : `${plan.durationDays} dias de licença`}
                        <span className="sm:hidden"> · {plan.deviceLimit} {plan.deviceLimit > 1 ? 'instalações' : 'instalação'}</span>
                      </p>
                    </div>
                    <p className="type-mono hidden text-sm text-ink-2 sm:block">
                      {plan.deviceLimit} {plan.deviceLimit > 1 ? 'instalações' : 'instalação'}
                    </p>
                    <div className="flex items-center justify-between gap-4 sm:contents">
                      <p className="type-mono text-xl text-ink-1">{formatCents(price.amountCents)}</p>
                      <Link href={`/comprar/${plan.slug}${comprarQuery}`} className={`btn btn--sm chamfer ${destaque ? 'btn--primary' : 'btn--ghost'}`}>
                        COMPRAR
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* regra crítica da licença — visível, sem letra miúda */}
            <div className="mt-8 border-l-2 border-heat py-1 pl-4">
              <p className="text-sm text-ink-1">{AVISO_LICENCA_INSTALACAO}</p>
              <p className="mt-1 text-sm text-ink-3">
                Renovar mantém a instalação atual. A regra completa aparece de novo, com
                confirmação, antes do pagamento.
              </p>
            </div>
          </div>
        </section>

        {/* ================= CTA FINAL ================= */}
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 text-center md:py-32">
            <h2 className="type-display text-4xl sm:text-5xl md:text-6xl">
              Chega de <span className="text-signal">adivinhar.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-ink-2">
              Veja o que está acontecendo na sua máquina, entenda cada recomendação e decida o que
              aplicar.
            </p>
            <a href="#planos" className="btn btn--primary chamfer mt-8">
              ESCOLHER MEU PLANO
            </a>
            <p className="type-mono mt-10 text-[11px] uppercase tracking-widest text-ink-4">
              {BRAND.fullName} · Se não podemos medir, não fingimos.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
