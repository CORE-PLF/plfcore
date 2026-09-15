import type { Metadata } from 'next'
import { StatusTag, Surface, SurfaceHead } from '@/components/ui'
import { BRAND } from '@/lib/brand'
import { db } from '@/lib/db'
import { PageHeader } from '../_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Changelog',
  description: `Histórico de versões do ${BRAND.name}, com notas de cada lançamento.`,
}

export default async function ChangelogPage() {
  const versions = await db.appVersion.findMany({
    where: { active: true },
    orderBy: { publishedAt: 'desc' },
  })

  return (
    <>
      <PageHeader
        kicker="VERSÕES"
        title="Changelog"
        lead="O que mudou em cada versão do app. Sem nota de versão, sem lançamento."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        {versions.length > 0 ? (
          <ol className="space-y-4">
            {versions.map((v, i) => (
              <li key={v.id}>
                <Surface flat={i > 0}>
                  <SurfaceHead
                    aside={
                      v.publishedAt
                        ? v.publishedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                        : undefined
                    }
                  >
                    <span className="flex items-center gap-3">
                      <span className="type-num">v{v.version}</span>
                      <StatusTag tone={i === 0 ? 'ok' : 'muted'}>{i === 0 ? 'ATUAL' : v.channel.toUpperCase()}</StatusTag>
                    </span>
                  </SurfaceHead>
                  <p className="whitespace-pre-line p-5 text-sm text-ink-2">{v.notes}</p>
                </Surface>
              </li>
            ))}
          </ol>
        ) : (
          <Surface flat className="p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-3">
              Nenhuma versão publicada ainda.
            </p>
          </Surface>
        )}
      </section>
    </>
  )
}
