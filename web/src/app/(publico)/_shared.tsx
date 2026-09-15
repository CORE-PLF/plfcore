import type { ReactNode } from 'react'
import { Kicker } from '@/components/ui'
import { db } from '@/lib/db'

// Peças compartilhadas entre a landing e as páginas públicas restantes.
// Dado de plano vem sempre do banco — nunca de constante hardcoded.

export function getPlans() {
  return db.plan.findMany({
    where: { active: true, product: { slug: 'resync' } },
    orderBy: { sortOrder: 'asc' },
    include: { prices: { where: { active: true, currency: 'BRL' } } },
  })
}

export type PlanWithPrices = Awaited<ReturnType<typeof getPlans>>[number]

export function PageHeader({
  kicker,
  title,
  lead,
}: {
  kicker: string
  title: ReactNode
  lead?: ReactNode
}) {
  return (
    <header className="border-b border-edge bg-carbon">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <Kicker>{kicker}</Kicker>
        <h1 className="type-display mt-2 max-w-4xl text-3xl md:text-[2.6rem]">{title}</h1>
        {lead && <p className="mt-4 max-w-2xl text-base text-ink-2">{lead}</p>}
      </div>
    </header>
  )
}

// Layout de leitura dos documentos legais.
export function LegalDoc({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <article className="py-12 md:py-16">
      <Kicker>{kicker}</Kicker>
      <h1 className="type-display mt-2 text-3xl md:text-[2.6rem]">{title}</h1>
      <p className="type-num mt-3 text-xs text-ink-3">Última atualização: {updated}</p>
      <div className="rule-fade mt-8" />
      <div className="mt-8">{children}</div>
    </article>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink-1">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}
