import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { DemoSeal, Kicker, Notice, Surface, SurfaceHead } from '@/components/ui'
import { BRAND } from '@/lib/brand'
import { formatCents } from '@/lib/money'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'
import { getPlans } from './(publico)/_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — Otimização do Windows com dados reais` },
  description: `O ${BRAND.name} lê CPU, GPU, RAM, discos e, quando o hardware expõe, temperaturas do seu Windows. Cada recomendação é explicada e toda alteração fica registrada. App oficial do servidor Pro League. Licença no painel, pagamento por PIX, cartão ou boleto.`,
  openGraph: {
    title: `${BRAND.name} — Otimização do Windows com dados reais`,
    description: 'Diagnóstico e otimização do Windows com dados reais, alterações explicadas e registradas.',
  },
}

// ===== conteúdo real (fonte: app) =====

const MODULOS: { nome: string; codigo: string; desc: string }[] = [
  {
    nome: 'COCKPIT',
    codigo: 'INST-01',
    desc: 'CPU, GPU e RAM ao vivo, com a fonte de cada leitura declarada na tela. Telemetria de 60 segundos.',
  },
  {
    nome: 'FPS BOOSTER',
    codigo: 'INST-02',
    desc: 'Lista os processos em segundo plano que pesam na máquina. Você vê a lista e escolhe o que encerrar.',
  },
  {
    nome: 'LIMPEZA',
    codigo: 'INST-03',
    desc: 'Caminhos temporários conhecidos, mostrados antes de remover. Downloads, documentos, fotos e saves ficam fora.',
  },
  {
    nome: 'RAIO-X',
    codigo: 'INST-04',
    desc: 'Inventário de processador, placa-mãe, memória, discos e GPU. Sem fonte para um dado, o campo diz NÃO DISPONÍVEL.',
  },
  {
    nome: 'WINDOWS',
    codigo: 'INST-05',
    desc: 'Plano de energia, Game Mode, efeitos visuais e apps em segundo plano. Cada item lista o que muda e espera a sua confirmação.',
  },
  {
    nome: 'FIVEM',
    codigo: 'INST-06',
    desc: 'Cache do FiveM limpo com as pastas de conta protegidas. Preparado para o servidor Pro League.',
  },
]

const DATA_SOURCES: [string, string][] = [
  ['CPU, clocks e núcleos', 'WMI / contadores do Windows'],
  ['GPU NVIDIA, VRAM e temperatura', 'NVIDIA-SMI'],
  ['RAM, discos e inventário', 'WMI'],
  ['Temperaturas', 'sensores do hardware, quando expostos'],
]

const FASES = [
  {
    n: '01',
    t: 'MEDIR',
    d: `O ${BRAND.name} lê os dados disponíveis e informa a fonte. Se não conseguir medir, não preenche o espaço com um número inventado.`,
  },
  {
    n: '02',
    t: 'ENTENDER E ESCOLHER',
    d: 'Cada recomendação explica o que muda, o efeito esperado e o risco. Você decide o que executar.',
  },
  {
    n: '03',
    t: 'REGISTRAR E COMPARAR',
    d: 'O estado anterior fica salvo no LOG. Depois da ação, o app mede de novo para mostrar o que realmente mudou.',
  },
]

// Instrumento do app com a agulha em repouso: nenhum valor é inventado — o número só existe na sua máquina.
function Gauge({ label, unit }: { label: string; unit: string }) {
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 200 138" className="block w-[132px] shrink-0" aria-hidden>
        <path d="M 21.07 128.73 A 84 84 0 1 1 178.93 128.73" fill="none" stroke="#2a2a2a" strokeWidth="7" />
        <path d="M 28.58 126 A 76 76 0 1 1 171.42 126" fill="none" stroke="#3d3d3d" strokeWidth="6" strokeDasharray="1.2 13.4" />
        <path d="M 176.74 65.84 A 84 84 0 0 1 178.93 128.73" fill="none" stroke="#e5262b" strokeWidth="7" />
        <line x1="24.82" y1="127.36" x2="35.16" y2="123.6" stroke="#7a7a7a" strokeWidth="2" />
        <line x1="34.46" y1="54.11" x2="43.48" y2="60.42" stroke="#7a7a7a" strokeWidth="2" />
        <line x1="100" y1="20" x2="100" y2="31" stroke="#7a7a7a" strokeWidth="2" />
        <line x1="165.54" y1="54.11" x2="156.52" y2="60.42" stroke="#7a7a7a" strokeWidth="2" />
        <line x1="175.18" y1="127.36" x2="164.84" y2="123.6" stroke="#e5262b" strokeWidth="2" />
        <text x="45.5" y="122.84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7d7d7d">0</text>
        <text x="100" y="45" textAnchor="middle" fontSize="9" fontWeight="700" fill="#7d7d7d">50</text>
        <text x="154.5" y="122.84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#e5262b">100</text>
        <g transform="rotate(-135 100 100)">
          <polygon points="98.4,100 101.6,100 100.6,26 99.4,26" fill="#ffffff" />
          <rect x="97.8" y="100" width="4.4" height="11" fill="rgba(255,255,255,.5)" />
        </g>
        <circle cx="100" cy="100" r="8" fill="#181818" stroke="rgba(255,255,255,.26)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="2.6" fill="#f8e800" />
      </svg>
      <div className="min-w-0">
        <p className="type-kicker">{label}</p>
        <p className="type-num text-3xl font-bold leading-none text-ink-1">
          —<span className="ml-1 text-sm text-ink-3">{unit}</span>
        </p>
        <p className="mt-1 text-[11px] text-ink-3">AGUARDANDO LEITURA</p>
      </div>
    </div>
  )
}

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
      name: BRAND.name,
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
        <section className="border-b border-edge">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-14 md:pt-20 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Kicker>App oficial do servidor Pro League</Kicker>
              <Image
                src="/brand/logo-grande.png"
                alt="Pro League"
                width={1280}
                height={590}
                priority
                className="mt-5 h-auto w-[260px] sm:w-[320px]"
              />
              <h1 className="type-display mt-6 text-[2.4rem] sm:text-5xl md:text-[3.4rem]">
                {BRAND.name}. {BRAND.tagline}
              </h1>
              <p className="mt-5 max-w-xl text-base text-ink-2">
                Lê CPU, GPU, RAM e discos do seu Windows, mostra a fonte de cada leitura e registra
                toda alteração — com reversão quando o sistema permite. Nada simulado, nada
                escondido atrás de uma barra de progresso.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/download" className="btn btn--primary btn--lg">
                  BAIXAR
                </Link>
                <a href="#planos" className="btn btn--ghost btn--lg">
                  VER PLANOS
                </a>
              </div>
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">
                Windows 10 e 11 · Dados ficam na sua máquina · 7 dias para reembolso
              </p>
            </div>

            <Surface className="overflow-hidden">
              <SurfaceHead aside="INST-01 · 02 · 03">Cockpit</SurfaceHead>
              <div className="space-y-2 p-4">
                <Gauge label="CPU · USO AGORA" unit="%" />
                <div className="rule-fade" />
                <Gauge label="GPU · USO AGORA" unit="%" />
                <div className="rule-fade" />
                <Gauge label="RAM · EM USO" unit="GB" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge bg-surface-2 px-4 py-2.5">
                <DemoSeal>ILUSTRAÇÃO — SEM DADOS MEDIDOS</DemoSeal>
                <span className="type-num flex items-center gap-2 text-[11px] font-bold tracking-[0.06em] text-ink-2">
                  <span className="led" aria-hidden />
                  SISTEMA // PRONTO
                </span>
              </div>
            </Surface>
          </div>
        </section>

        {/* ================= O QUE FAZ ================= */}
        <section id="produto" className="scroll-mt-20 border-b border-edge">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <Kicker>Módulos</Kicker>
            <h2 className="type-display mt-2 text-3xl md:text-4xl">O que faz</h2>
            <p className="mt-4 max-w-2xl text-ink-2">
              Clicar em um preset e ver uma barra chegar a 100% não prova que algo melhorou. Cada
              módulo mostra a origem dos dados, o que pretende alterar e o resultado medido depois.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {MODULOS.map((m) => (
                <Surface key={m.nome}>
                  <SurfaceHead aside={m.codigo}>{m.nome}</SurfaceHead>
                  <p className="p-4 text-sm text-ink-2">{m.desc}</p>
                </Surface>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Surface flat className="p-5">
                <p className="type-kicker">O jeito genérico</p>
                <ul className="mt-3 space-y-2 text-sm text-ink-3">
                  <li>Perfil ou preset sem explicação.</li>
                  <li>Número sem fonte.</li>
                  <li>Alteração escondida atrás de uma barra de progresso.</li>
                  <li>Resultado prometido, nunca medido.</li>
                </ul>
              </Surface>
              <Surface className="p-5" edge="var(--color-signal)">
                <p className="type-kicker text-signal">O jeito {BRAND.name}</p>
                <ul className="mt-3 space-y-2 text-sm text-ink-1">
                  <li>Leitura real, com a fonte declarada na tela.</li>
                  <li>Confirmação antes de qualquer mudança.</li>
                  <li>Registro de tudo no LOG, com estado anterior.</li>
                  <li>Nova medição depois, para comparar.</li>
                </ul>
              </Surface>
            </div>
          </div>
        </section>

        {/* ================= COMO FUNCIONA ================= */}
        <section id="como-funciona" className="scroll-mt-20 border-b border-edge">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <Kicker>Fluxo</Kicker>
            <h2 className="type-display mt-2 text-3xl md:text-4xl">Como funciona</h2>

            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {FASES.map((fase) => (
                <li key={fase.n}>
                  <Surface className="h-full p-5">
                    <span className="type-num text-[11px] font-bold tracking-[0.18em] text-signal">{fase.n}</span>
                    <h3 className="mt-2 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-1">{fase.t}</h3>
                    <p className="mt-2 text-sm text-ink-2">{fase.d}</p>
                  </Surface>
                </li>
              ))}
            </ol>

            <Surface flat className="mt-6 p-5">
              <p className="type-kicker">Da compra ao app</p>
              <p className="type-num mt-2 text-sm text-ink-2">
                Escolha o plano <span className="text-signal">→</span> entre ou crie sua conta{' '}
                <span className="text-signal">→</span> pague <span className="text-signal">→</span>{' '}
                receba a licença no painel <span className="text-signal">→</span> baixe e ative.
              </p>
              <p className="mt-2 text-sm text-ink-3">Discord é opcional. Sua licença sempre fica disponível no painel.</p>
            </Surface>
          </div>
        </section>

        {/* ================= TRANSPARÊNCIA ================= */}
        <section id="transparencia" className="scroll-mt-20 border-b border-edge">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <Kicker>Transparência</Kicker>
            <h2 className="type-display mt-2 text-3xl md:text-4xl">Se está na tela, tem fonte.</h2>

            <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              <Surface>
                <SurfaceHead>Leituras e fontes</SurfaceHead>
                <dl className="p-3">
                  {DATA_SOURCES.map(([leitura, fonte]) => (
                    <div key={leitura} className="datarow">
                      <dt>{leitura}</dt>
                      <dd className="text-[12px] font-semibold normal-case text-ink-2">{fonte}</dd>
                    </div>
                  ))}
                </dl>
                <div className="border-t border-line p-4">
                  <p className="text-sm font-bold text-ink-1">Limitações, sem esconder</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink-3">
                    <li>Nem todo hardware expõe temperatura.</li>
                    <li>Leituras instantâneas podem refletir picos.</li>
                    <li>GPUs não NVIDIA podem ter dados mais limitados.</li>
                    <li>Algumas funções exigem privilégio de administrador.</li>
                  </ul>
                  <p className="mt-3 text-sm text-ink-3">
                    Benchmarks só serão publicados quando existirem medições reais seguindo a
                    metodologia declarada. Hoje não há benchmarks publicados.
                  </p>
                </div>
              </Surface>

              <div className="grid gap-4">
                <Surface>
                  <SurfaceHead>O que não coletamos</SurfaceHead>
                  <ul className="space-y-1.5 p-4 text-sm text-ink-2">
                    <li>Arquivos pessoais.</li>
                    <li>Histórico de navegação.</li>
                    <li>Senhas ou teclas digitadas.</li>
                    <li>Capturas da sua atividade.</li>
                  </ul>
                </Surface>
                <Surface>
                  <SurfaceHead>O que vai ao servidor</SurfaceHead>
                  <div className="p-4 text-sm">
                    <ul className="space-y-1.5 text-ink-2">
                      <li>Dados de conta, compra e validação da licença.</li>
                      <li>Chave, identificador da instalação e versão do app.</li>
                    </ul>
                    <p className="mt-3 text-ink-3">
                      As leituras do seu hardware ficam na sua máquina.{' '}
                      <Link href="/legal/privacidade" className="text-ink-1 underline underline-offset-4">
                        Política de privacidade completa
                      </Link>
                      .
                    </p>
                  </div>
                </Surface>
              </div>
            </div>
          </div>
        </section>

        {/* ================= PLANOS ================= */}
        <section id="planos" className="scroll-mt-20 border-b border-edge">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <Kicker>Licença</Kicker>
            <h2 className="type-display mt-2 text-3xl md:text-4xl">Planos</h2>
            <p className="mt-3 max-w-2xl text-sm text-ink-2">
              O app é o mesmo em todos os planos — muda a duração e o limite de instalações.
            </p>
            {novaInstalacao && (
              <div className="mt-4">
                <DemoSeal>Compra para nova instalação — será emitida uma chave nova</DemoSeal>
              </div>
            )}

            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const price = plan.prices[0]
                if (!price) return null
                const destaque = plan.featured
                const features = Array.isArray(plan.features) ? (plan.features as string[]) : []
                return (
                  <Surface key={plan.id} edge={destaque ? 'var(--color-signal)' : undefined} className="flex flex-col">
                    <SurfaceHead aside={destaque ? <span className="pill pill--signal">Recomendado</span> : undefined}>
                      {plan.name}
                    </SurfaceHead>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="type-num text-4xl font-bold leading-none text-ink-1">{formatCents(price.amountCents)}</p>
                      <dl className="mt-4">
                        <div className="datarow">
                          <dt>Duração</dt>
                          <dd>{plan.durationDays === null ? 'SEM EXPIRAÇÃO' : `${plan.durationDays} DIAS`}</dd>
                        </div>
                        <div className="datarow">
                          <dt>Instalações</dt>
                          <dd>{plan.deviceLimit}</dd>
                        </div>
                      </dl>
                      {features.length > 0 && (
                        <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
                          {features.map((f) => (
                            <li key={f} className="flex gap-2">
                              <span aria-hidden className="text-ink-1">✓</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                      <Link
                        href={`/comprar/${plan.slug}${comprarQuery}`}
                        className={`btn mt-6 w-full ${destaque ? 'btn--primary' : 'btn--ghost'}`}
                      >
                        COMPRAR
                      </Link>
                    </div>
                  </Surface>
                )
              })}
            </div>

            {/* regra crítica da licença — visível, sem letra miúda */}
            <Notice className="mt-6" title="Licença por instalação">
              <p className="text-ink-1">{AVISO_LICENCA_INSTALACAO}</p>
              <p className="mt-1 text-ink-3">
                Renovar mantém a instalação atual. A regra completa aparece de novo, com
                confirmação, antes do pagamento.
              </p>
            </Notice>
          </div>
        </section>

        {/* ================= DOWNLOAD ================= */}
        <section id="download">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
            <Surface className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
              <div>
                <Kicker>Instalador</Kicker>
                <h2 className="type-display mt-2 text-2xl md:text-3xl">Baixe só daqui.</h2>
                <p className="mt-3 max-w-xl text-sm text-ink-2">
                  Sempre a versão atual, com checksum SHA-256 publicado. Não distribuímos o
                  instalador por outros canais. A licença é ativada dentro do app.
                </p>
              </div>
              <Link href="/download" className="btn btn--primary btn--lg">
                BAIXAR
              </Link>
            </Surface>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
