import type { Metadata } from 'next'
import { Chamfer, Kicker, StatusTag } from '@/components/ui'
import { env } from '@/lib/env'
import { PageHeader } from '../_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'STATUS',
  description: 'Estado atual do site e do banco de dados, verificado no carregamento da página.',
}

async function check(path: string): Promise<boolean> {
  try {
    const res = await fetch(new URL(path, env.APP_URL), { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

export default async function StatusPage() {
  const [site, banco] = await Promise.all([check('/api/health'), check('/api/ready')])
  const verificadoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const servicos = [
    {
      nome: 'SITE',
      desc: 'Aplicação web respondendo (verificação /api/health).',
      ok: site,
    },
    {
      nome: 'BANCO DE DADOS',
      desc: 'Banco alcançável — pedidos, licenças e painel dependem dele (verificação /api/ready).',
      ok: banco,
    },
  ]

  return (
    <>
      <PageHeader
        kicker="OPERAÇÃO"
        title="STATUS DOS SERVIÇOS"
        lead="Verificação feita agora, no carregamento desta página. Não publicamos histórico de uptime porque ainda não o medimos — número que não medimos, não mostramos."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        <div className="space-y-3">
          {servicos.map((s) => (
            <Chamfer
              key={s.nome}
              cut={6}
              flat
              edge={s.ok ? undefined : 'var(--color-signal)'}
              className="scanlines flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div>
                <h2 className="type-display text-lg">{s.nome}</h2>
                <p className="mt-1 text-sm text-ink-3">{s.desc}</p>
              </div>
              <StatusTag tone={s.ok ? 'ok' : 'danger'}>
                {s.ok ? '✓ OPERACIONAL' : '✕ FALHA'}
              </StatusTag>
            </Chamfer>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Kicker>VERIFICADO EM</Kicker>
          <p className="type-mono text-xs text-ink-2">{verificadoEm} (horário de Brasília)</p>
        </div>

        {(!site || !banco) && (
          <Chamfer cut={6} edge="var(--color-rust)" className="mt-8 p-5">
            <p className="text-sm text-ink-1">
              Um ou mais serviços não responderam. Recarregue a página em alguns minutos; se o
              problema persistir, fale com a gente pela página de contato.
            </p>
          </Chamfer>
        )}
      </section>
    </>
  )
}
