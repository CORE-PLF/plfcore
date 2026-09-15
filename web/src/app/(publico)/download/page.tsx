import type { Metadata } from 'next'
import Link from 'next/link'
import { Chamfer, Kicker, StatusTag } from '@/components/ui'
import { getInstaller } from '@/lib/installer'
import { findLiveLicense } from '@/lib/licensing'
import { currentUser } from '@/lib/session'
import { PageHeader } from '../_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'DOWNLOAD',
  description: 'Baixe a versão atual da Resync. Checksum publicado para verificação de integridade.',
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
        title="DOWNLOAD"
        lead="Sempre a versão atual, com checksum publicado. Baixe apenas daqui — não distribuímos o instalador por outros canais."
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
        {inst ? (
          <Chamfer cut={12} brackets edge="var(--color-signal)" className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="type-mono text-2xl font-bold text-ink-1">v{inst.version}</h2>
              <StatusTag tone="ok">VERSÃO ATUAL</StatusTag>
              {inst.publishedAt && (
                <span className="type-mono ml-auto text-xs text-ink-3">
                  {inst.publishedAt.toLocaleDateString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}
                </span>
              )}
            </div>

            <dl className="mt-6 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="type-kicker">ARQUIVO</dt>
                <dd className="type-mono text-sm text-ink-2">{inst.fileName}</dd>
              </div>
              {inst.sizeBytes != null && (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="type-kicker">TAMANHO</dt>
                  <dd className="type-mono text-sm text-ink-2">
                    {formatBytes(Number(inst.sizeBytes))}
                  </dd>
                </div>
              )}
              <div>
                <dt className="type-kicker">CHECKSUM (SHA-256)</dt>
                <dd className="type-mono mt-1.5 break-all bg-void px-3 py-2 text-xs text-ink-2">
                  {inst.checksum}
                </dd>
              </div>
              {inst.notes && (
                <div>
                  <dt className="type-kicker">NOTAS DA VERSÃO</dt>
                  <dd className="mt-1.5 text-sm text-ink-2">{inst.notes}</dd>
                </div>
              )}
            </dl>

            <div className="mt-8">
              {!user ? (
                <>
                  <Link
                    href="/entrar?next=%2Fdownload"
                    className="btn btn--primary chamfer w-full sm:w-auto"
                  >
                    ENTRAR PARA BAIXAR
                  </Link>
                  <p className="mt-3 text-sm text-ink-3">
                    O instalador é entregue só para quem tem licença — entre na sua conta para
                    baixar. Ainda não tem licença? Escolha um plano em{' '}
                    <Link href="/#planos" className="text-ink-1 underline">
                      planos
                    </Link>
                    .
                  </p>
                </>
              ) : !licenca ? (
                <Chamfer cut={6} flat edge="var(--color-heat)" className="p-4" role="status">
                  <p className="type-kicker" style={{ color: 'var(--color-heat)' }}>
                    SEM LICENÇA NESTA CONTA
                  </p>
                  <p className="mt-2 text-sm text-ink-2">
                    O download do instalador é liberado depois da compra. Escolha um plano e a
                    chave aparece no seu painel na hora da confirmação.
                  </p>
                  <Link href="/#planos" className="btn btn--primary chamfer mt-4">
                    VER PLANOS
                  </Link>
                </Chamfer>
              ) : (
                <>
                  <a href="/download/arquivo" className="btn btn--primary chamfer w-full sm:w-auto">
                    BAIXAR v{inst.version}
                  </a>
                  <p className="type-mono mt-3 text-[10px] uppercase tracking-widest text-ink-4">
                    O download fica registrado na sua conta.
                  </p>
                </>
              )}
            </div>
          </Chamfer>
        ) : (
          <Chamfer cut={8} flat className="p-8 text-center">
            <p className="type-mono text-sm text-ink-3">NENHUMA VERSÃO DISPONÍVEL NO MOMENTO.</p>
            <p className="mt-2 text-sm text-ink-3">
              Acompanhe o{' '}
              <Link href="/changelog" className="text-ink-1 underline">
                changelog
              </Link>
              .
            </p>
          </Chamfer>
        )}

        <div className="mt-8">
          <Kicker>VERIFICAÇÃO DE INTEGRIDADE</Kicker>
          <p className="mt-3 text-sm text-ink-3">
            Para conferir que o arquivo baixado é exatamente o que publicamos, gere o SHA-256 local
            e compare com o checksum acima. No PowerShell:
          </p>
          <p className="type-mono mt-2 overflow-x-auto bg-carbon px-4 py-3 text-xs text-ink-2">
            Get-FileHash .\{inst?.fileName ?? 'ResyncSetup.exe'} -Algorithm SHA256
          </p>
        </div>
      </section>
    </>
  )
}
