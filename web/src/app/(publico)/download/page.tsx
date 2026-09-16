import type { Metadata } from 'next'
import Link from 'next/link'
import { Kicker, Notice, StatusTag, Surface, SurfaceHead } from '@/components/ui'
import { BRAND } from '@/lib/brand'
import { getInstaller } from '@/lib/installer'
import { findLiveLicense } from '@/lib/licensing'
import { currentUser } from '@/lib/session'
import { PageHeader } from '../_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Download',
  description: `Baixe a versão atual do ${BRAND.name}. Checksum publicado para verificação de integridade.`,
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1048576
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

export default async function DownloadPage() {
  const [user, inst] = await Promise.all([currentUser(), getInstaller()])
  const licenca = user ? await findLiveLicense(user.id) : null

  return (
    <>
      <PageHeader
        kicker="INSTALADOR"
        title="Download"
        lead="Sempre a versão atual, com checksum publicado. Baixe apenas daqui — não distribuímos o instalador por outros canais."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        {inst ? (
          <Surface>
            <SurfaceHead
              aside={
                inst.publishedAt
                  ? inst.publishedAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                  : undefined
              }
            >
              Versão atual
            </SurfaceHead>
            <div className="p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="type-num text-3xl font-bold text-ink-1">v{inst.version}</h2>
                <StatusTag tone="ok">✓ VERSÃO ATUAL</StatusTag>
              </div>

              <dl className="mt-5">
                <div className="datarow">
                  <dt>Arquivo</dt>
                  <dd className="normal-case">{inst.fileName}</dd>
                </div>
                {inst.sizeBytes != null && (
                  <div className="datarow">
                    <dt>Tamanho</dt>
                    <dd>{formatBytes(Number(inst.sizeBytes))}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-4">
                <Kicker>Checksum (SHA-256)</Kicker>
                <p className="type-num mt-1.5 break-all rounded-ctl border border-edge bg-void px-3 py-2 text-xs text-ink-2">
                  {inst.checksum}
                </p>
              </div>
              {inst.notes && (
                <div className="mt-4">
                  <Kicker>Notas da versão</Kicker>
                  <p className="mt-1.5 whitespace-pre-line text-sm text-ink-2">{inst.notes}</p>
                </div>
              )}

              <div className="mt-6">
                {!user ? (
                  <>
                    <Link href="/entrar?next=%2Fdownload" className="btn btn--primary w-full sm:w-auto">
                      ENTRAR PARA BAIXAR
                    </Link>
                    <p className="mt-3 text-sm text-ink-3">
                      O instalador é entregue só para quem tem licença — entre na sua conta para
                      baixar. Ainda não tem licença? Escolha um plano em{' '}
                      <Link href="/#planos" className="text-ink-1 underline underline-offset-4">
                        planos
                      </Link>
                      .
                    </p>
                  </>
                ) : !licenca ? (
                  <Notice title="Sem licença nesta conta" role="status">
                    <p>
                      O download do instalador é liberado depois da compra. Escolha um plano e a
                      chave aparece no seu painel na hora da confirmação.
                    </p>
                    <Link href="/#planos" className="btn btn--primary mt-4">
                      VER PLANOS
                    </Link>
                  </Notice>
                ) : (
                  <>
                    <a href="/download/arquivo" className="btn btn--primary btn--lg w-full sm:w-auto">
                      BAIXAR v{inst.version}
                    </a>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">
                      O download fica registrado na sua conta.
                    </p>
                  </>
                )}
              </div>
            </div>
          </Surface>
        ) : (
          <Surface flat className="p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-3">
              Nenhuma versão disponível no momento.
            </p>
            <p className="mt-2 text-sm text-ink-3">
              Acompanhe o{' '}
              <Link href="/changelog" className="text-ink-1 underline underline-offset-4">
                changelog
              </Link>
              .
            </p>
          </Surface>
        )}

      </section>
    </>
  )
}
