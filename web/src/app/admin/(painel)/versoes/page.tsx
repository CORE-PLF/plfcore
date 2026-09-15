import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { publishAppVersionAction, upsertAppVersionAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { INSTALLERS_DIR, getInstaller } from '@/lib/installer'
import { Flash, PageTitle, Table, Td, fmtDate, type SP } from '../../_ui'
import { InstallerUpload } from './upload-form'

export default async function AdminAppVersionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams

  const [versions, noAr] = await Promise.all([
    db.appVersion.findMany({
      include: { _count: { select: { downloads: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    // a versão que o site realmente entrega — publicar em beta não bota nada no ar
    getInstaller(),
  ])

  return (
    <>
      <PageTitle kicker="VERSÕES DO APP" title="DISTRIBUIÇÃO" />
      <Flash sp={sp} />

      <Chamfer cut={8} className="mb-6 max-w-2xl p-5">
        <h2 className="type-kicker mb-3">NOVA VERSÃO</h2>
        <form action={upsertAppVersionAction} className="grid gap-3 sm:grid-cols-2">
          <input name="version" required placeholder="1.4.0" aria-label="Versão" className="field type-mono" />
          <select name="channel" defaultValue="stable" aria-label="Canal" className="field">
            <option value="stable">STABLE — VAI PARA O /DOWNLOAD</option>
            <option value="beta">BETA — NÃO APARECE NO SITE</option>
          </select>
          <InstallerUpload />
          <input
            id="fileName"
            name="fileName"
            required
            placeholder="ResyncSetup-1.4.0.exe"
            aria-label="Nome do arquivo no volume"
            className="field type-mono sm:col-span-2"
          />
          <input
            name="checksum"
            required
            placeholder="SHA-256 do instalador (Get-FileHash na sua máquina)"
            aria-label="Checksum"
            className="field type-mono sm:col-span-2"
          />
          <p className="type-mono text-[11px] text-ink-3 sm:col-span-2">
            O arquivo mora em {INSTALLERS_DIR} e só é entregue por rota autenticada. O SHA-256 é
            recalculado no servidor e comparado com o informado — divergiu, a versão não é salva.
          </p>
          <textarea
            name="notes"
            rows={3}
            placeholder="Notas da versão"
            aria-label="Notas da versão"
            className="field sm:col-span-2"
          />
          <button type="submit" className="btn btn--primary chamfer sm:col-span-2">
            CRIAR VERSÃO
          </button>
        </form>
      </Chamfer>

      {versions.length === 0 ? (
        <p className="type-mono text-[12px] text-ink-3">Nenhuma versão cadastrada.</p>
      ) : (
        <Table head={['VERSÃO', 'CANAL', 'PUBLICADA', 'DOWNLOADS', 'CRIADA', 'AÇÕES']}>
          {versions.map((v) => (
            <tr key={v.id}>
              <Td className="text-ink-1">{v.version}</Td>
              <Td>{v.channel}</Td>
              <Td>
                {!v.publishedAt || !v.active ? (
                  <StatusTag tone="muted">NÃO PUBLICADA</StatusTag>
                ) : noAr?.version === v.version ? (
                  <StatusTag tone="ok">NO AR EM /DOWNLOAD {fmtDate(v.publishedAt)}</StatusTag>
                ) : (
                  <>
                    <StatusTag tone="warn">PUBLICADA, FORA DO AR</StatusTag>
                    <p className="type-mono mt-1 text-[10px] text-ink-3">
                      {v.channel === 'stable'
                        ? 'outra versão stable é mais recente'
                        : `canal ${v.channel} não é entregue no site — mude para stable`}
                    </p>
                  </>
                )}
              </Td>
              <Td>{v._count.downloads}</Td>
              <Td>{fmtDate(v.createdAt)}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/versoes/${v.id}`} className="btn btn--ghost btn--sm chamfer">
                    EDITAR
                  </Link>
                  <form action={publishAppVersionAction}>
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="to" value={v.publishedAt && v.active ? 'unpublish' : 'publish'} />
                    <button
                      type="submit"
                      className={`btn btn--sm chamfer ${v.publishedAt && v.active ? 'btn--danger' : 'btn--primary'}`}
                    >
                      {v.publishedAt && v.active ? 'DESPUBLICAR' : 'PUBLICAR'}
                    </button>
                  </form>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
