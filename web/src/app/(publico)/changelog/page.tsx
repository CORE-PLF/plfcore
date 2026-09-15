import type { Metadata } from 'next'
import { Chamfer, StatusTag } from '@/components/ui'
import { db } from '@/lib/db'
import { PageHeader } from '../_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'CHANGELOG',
  description: 'Histórico de versões da Resync, com notas de cada lançamento.',
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
        title="CHANGELOG"
        lead="O que mudou em cada versão do app. Sem nota de versão, sem lançamento."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        {versions.length > 0 ? (
          <ol className="space-y-4">
            {versions.map((v, i) => (
              <li key={v.id}>
                <Chamfer cut={6} flat={i > 0} className="p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="type-mono text-xl font-bold text-ink-1">v{v.version}</h2>
                    <StatusTag tone={i === 0 ? 'ok' : 'muted'}>
                      {i === 0 ? 'ATUAL' : v.channel.toUpperCase()}
                    </StatusTag>
                    {v.publishedAt && (
                      <span className="type-mono ml-auto text-xs text-ink-3">
                        {v.publishedAt.toLocaleDateString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 whitespace-pre-line text-sm text-ink-2">{v.notes}</p>
                </Chamfer>
              </li>
            ))}
          </ol>
        ) : (
          <Chamfer cut={8} flat className="p-8 text-center">
            <p className="type-mono text-sm text-ink-3">NENHUMA VERSÃO PUBLICADA AINDA.</p>
          </Chamfer>
        )}
      </section>
    </>
  )
}
