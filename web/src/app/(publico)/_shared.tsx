import type { ReactNode } from 'react'
import { Kicker, RuleFade } from '@/components/ui'
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
    <header className="border-b border-line">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:py-20">
        <Kicker>{kicker}</Kicker>
        <h1 className="type-display mt-3 max-w-4xl text-4xl md:text-6xl">{title}</h1>
        {lead && <p className="mt-5 max-w-2xl text-base text-ink-2">{lead}</p>}
        <RuleFade className="mt-10" />
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
    <article className="py-14 md:py-20">
      <Kicker>{kicker}</Kicker>
      <h1 className="type-display mt-3 text-3xl md:text-5xl">{title}</h1>
      <p className="type-mono mt-3 text-xs text-ink-3">Última atualização: {updated}</p>
      <RuleFade className="mt-8" />
      <div className="mt-8">{children}</div>
    </article>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="type-display text-xl md:text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}
