import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CockpitDemo } from '@/components/cockpit-demo'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { DemoSeal } from '@/components/ui'
import { BRAND } from '@/lib/brand'
import { formatCents } from '@/lib/money'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'
import { getPlans } from './(publico)/_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — Seu PC medido, não prometido` },
  description: `O ${BRAND.name} lê CPU, GPU, RAM e discos do seu Windows, declara a fonte de cada número e guarda o estado anterior de tudo que altera. App oficial do servidor Pro League. Licença no painel, pagamento por PIX ou cartão.`,
  openGraph: {
    title: `${BRAND.name} — Seu PC medido, não prometido`,
    description: 'Diagnóstico e otimização do Windows com dados reais, alterações explicadas e registradas.',
  },
}

// ===== conteúdo real (fonte: app) =====

const SELOS: [string, string][] = [
  ['Sistema', 'Windows 10 e 11'],
  ['Leituras', 'Ficam na sua máquina'],
  ['Licença', '1 instalação'],
]

const MODULOS: { codigo: string; nome: string; desc: string }[] = [
  { codigo: 'INST-01', nome: 'Cockpit', desc: 'CPU, GPU e RAM ao vivo, telemetria de 60 s e a fonte de cada leitura na tela.' },
  { codigo: 'INST-02', nome: 'FPS Booster', desc: 'Pacotes de aceleração com o estado real lido da máquina — reversíveis pelo mesmo interruptor.' },
  { codigo: 'INST-03', nome: 'Limpeza', desc: 'Temporários conhecidos mostrados antes de remover. Documentos, fotos e saves ficam fora.' },
  { codigo: 'INST-04', nome: 'Raio-X', desc: 'Inventário de CPU, placa-mãe, memória, discos e GPU. Sem fonte, o campo diz NÃO DISPONÍVEL.' },
  { codigo: 'INST-05', nome: 'Windows', desc: 'Energia, Game Mode e efeitos visuais — cada item espera a sua confirmação.' },
  { codigo: 'INST-06', nome: 'FiveM', desc: 'Cache limpo com as pastas de conta protegidas. Preparado para o servidor Pro League.' },
]

// dimensões reais de public/shots/fps-booster.png
const SHOT_W = 1920
const SHOT_H = 1080

function StatusBar({ children, top = false }: { children: ReactNode; top?: boolean }) {
  return (
    <div className={`reveal flex items-center gap-3.5 border-b border-line py-[18px] ${top ? 'border-t' : ''}`}>
      <span className="led" aria-hidden />
      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.24em] text-ink-3">{children}</span>
    </div>
  )
}

function SectionTitle({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="grid items-end gap-7 py-14 md:grid-cols-2">
      <h2 className="reveal text-[1.8rem] font-black uppercase leading-none tracking-[-0.04em] text-ink-1 md:text-[3rem]">
        {title}
      </h2>
      <p className="reveal max-w-[440px] text-[15px] leading-[1.6] text-ink-3">{lead}</p>
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
        <section className="border-b border-line">
          <div className="mx-auto grid w-full max-w-6xl lg:grid-cols-2">
            <div className="reveal px-4 pb-14 pt-14 md:pt-[72px] lg:border-r lg:border-line lg:pb-[76px] lg:pr-10">
              <p className="flex items-center gap-2.5 text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-3">
                <span className="led" aria-hidden />
                App oficial · servidor Pro League
              </p>
              <h1 className="mt-6 text-[2.6rem] font-black uppercase leading-[1.02] tracking-[-0.05em] text-ink-1 sm:text-[3.4rem] xl:text-[4.6rem]">
                Seu PC
                <br />
                medido —
                <br />
                <span className="text-signal">não prometido.</span>
              </h1>
              <p className="mt-6 max-w-[470px] text-[16.5px] leading-[1.6] text-ink-2">
                O {BRAND.name} lê CPU, GPU, RAM e discos do seu Windows, declara a fonte de cada número e
                guarda o estado anterior de tudo que altera. Você confirma, o app mede de novo.
              </p>
              <div className="mt-8 flex flex-wrap gap-2.5">
                <a href="#planos" className="btn btn--primary btn--lg">
                  COMPRAR LICENÇA
                </a>
                <a href="#modulos" className="btn btn--ghost btn--lg">
                  O QUE FAZ
                </a>
              </div>
              <dl className="mt-[30px] grid gap-px border border-line bg-line">
                {SELOS.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-3 bg-carbon px-3.5 py-[11px] text-[10.5px] font-bold uppercase tracking-[0.14em]"
                  >
                    <dt className="text-[#6e6e6e]">{k}</dt>
                    <dd className="text-ink-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="reveal lg:mb-[76px]">
              <CockpitDemo />
            </div>
          </div>
        </section>

        {/* ================= MÓDULOS ================= */}
        <section id="modulos" className="scroll-mt-[60px]">
          <div className="mx-auto w-full max-w-6xl px-4">
            <StatusBar>Módulos do app — 06 instrumentos</StatusBar>
            <SectionTitle
              title="O que o app faz"
              lead="Cada instrumento diz de onde vem o dado, o que pretende mudar e mede de novo depois da sua confirmação."
            />

            <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {MODULOS.map((m) => (
                <div key={m.codigo} className="reveal bg-carbon px-[22px] pb-[26px] pt-6 transition-colors hover:bg-surface-2">
                  <div className="flex items-center gap-2.5">
                    <span className="type-num text-[10px] font-extrabold tracking-[0.2em] text-signal">{m.codigo}</span>
                    <span className="h-px flex-1 bg-[#1e1e1e]" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-[17px] font-black uppercase tracking-[0.02em] text-ink-1">{m.nome}</h3>
                  <p className="mt-2 text-sm leading-[1.55] text-ink-3">{m.desc}</p>
                </div>
              ))}
            </div>

            <figure className="reveal mt-7 border border-line">
              <figcaption className="flex items-center gap-3 border-b border-line bg-steel px-3.5 py-[11px] text-[9.5px] font-extrabold uppercase tracking-[0.2em] text-[#6e6e6e]">
                <span>{BRAND.name} — FPS Booster</span>
                <span className="ml-auto text-signal">Tela real do app</span>
              </figcaption>
              <Image
                src="/shots/fps-booster.png"
                alt={`Tela FPS Booster do ${BRAND.name}`}
                width={SHOT_W}
                height={SHOT_H}
                sizes="(min-width: 1152px) 1120px, 100vw"
                className="block h-auto w-full"
              />
            </figure>
          </div>
        </section>

        {/* ================= PLANOS ================= */}
        <section id="planos" className="scroll-mt-[60px]">
          <div className="mx-auto w-full max-w-6xl px-4 pb-24">
            <div className="mt-[88px]">
              <StatusBar top>Licença — emissão imediata no painel</StatusBar>
            </div>
            <SectionTitle
              title="Planos"
              lead="Mesmo app em todos. Muda a duração. Uma licença vale para 1 instalação do Windows."
            />
            {novaInstalacao && (
              <div className="mb-4">
                <DemoSeal>Compra para nova instalação — será emitida uma chave nova</DemoSeal>
              </div>
            )}

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
                    className={`reveal relative flex flex-col px-[26px] pb-[30px] pt-[34px] transition-colors ${
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
                    <p className={`type-num mt-[22px] flex items-end gap-1.5 ${destaque ? 'text-void' : 'text-ink-1'}`}>
                      <span className="text-sm font-bold opacity-55">R$</span>
                      <span className="text-[3.3rem] font-black leading-[0.85] tracking-[-0.05em]">{valor}</span>
                    </p>
                    <p
                      className={`mt-3 text-[10.5px] font-extrabold uppercase tracking-[0.16em] ${
                        destaque ? 'text-void/70' : 'text-ink-3'
                      }`}
                    >
                      {duracao} · {instalacoes}
                    </p>
                    <Link
                      href={`/comprar/${plan.slug}${comprarQuery}`}
                      className={`btn mt-7 w-full ${destaque ? 'btn--inverse' : 'btn--ghost'}`}
                    >
                      COMPRAR
                    </Link>
                  </div>
                )
              })}
            </div>

            <div className="reveal mt-[22px] flex flex-wrap gap-x-7 gap-y-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink-4">
              <span>PIX · cartão</span>
              <span>Chave no painel após o pagamento</span>
            </div>
            {/* regra crítica da licença — visível, sem letra miúda */}
            <p className="reveal mt-4 max-w-[640px] text-[13px] leading-[1.65] text-ink-3">
              {AVISO_LICENCA_INSTALACAO} Renovar mantém a instalação atual. A regra aparece de novo, com
              confirmação, antes do pagamento.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
