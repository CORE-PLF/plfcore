import type { Metadata } from 'next'
import { Kicker, Notice, StatusTag, Surface } from '@/components/ui'
import { env } from '@/lib/env'
import { PageHeader } from '../_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Status',
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
        title="Status dos serviços"
        lead="Verificação feita agora, no carregamento desta página. Não publicamos histórico de uptime porque ainda não o medimos — número que não medimos, não mostramos."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        <div className="space-y-3">
          {servicos.map((s) => (
            <Surface
              key={s.nome}
              edge={s.ok ? undefined : 'var(--color-blood)'}
              className="flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="flex items-start gap-3">
                <span className={s.ok ? 'led mt-1.5' : 'circle mt-1.5 inline-block h-[7px] w-[7px] bg-blood'} aria-hidden />
                <div>
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink-1">{s.nome}</h2>
                  <p className="mt-1 text-sm text-ink-3">{s.desc}</p>
                </div>
              </div>
              <StatusTag tone={s.ok ? 'ok' : 'danger'}>{s.ok ? '✓ OPERACIONAL' : '✕ FALHA'}</StatusTag>
            </Surface>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Kicker>VERIFICADO EM</Kicker>
          <p className="type-num text-xs text-ink-2">{verificadoEm} (horário de Brasília)</p>
        </div>

        {(!site || !banco) && (
          <Notice tone="danger" title="Serviço sem resposta" className="mt-8">
            <p className="text-ink-1">
              Um ou mais serviços não responderam. Recarregue a página em alguns minutos; se o
              problema persistir, fale com a gente pelo suporte do painel.
            </p>
          </Notice>
        )}
      </section>
    </>
  )
}
