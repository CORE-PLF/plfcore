import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { upsertAppVersionAction } from '@/lib/actions/admin'
import { Chamfer } from '@/components/ui'
import { Flash, type SP } from '../../../_ui'

export default async function AdminAppVersionEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SP>
}) {
  await requireStaff('ADMIN')
  const { id } = await params
  const sp = await searchParams
  const version = await db.appVersion.findUnique({ where: { id } })
  if (!version) notFound()

  return (
    <>
      <header className="mb-6">
        <p className="type-kicker">
          <Link href="/admin/versoes" className="underline">VERSÕES DO APP</Link> / EDITAR
        </p>
        <h1 className="type-display mt-1 text-3xl">VERSÃO {version.version}</h1>
      </header>
      <Flash sp={sp} />

      <Chamfer cut={8} className="max-w-2xl p-5">
        <form action={upsertAppVersionAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={version.id} />
          <div>
            <label htmlFor="version" className="type-kicker mb-1.5 block">VERSÃO</label>
            <input id="version" name="version" required defaultValue={version.version} className="field type-mono" />
          </div>
          <div>
            <label htmlFor="channel" className="type-kicker mb-1.5 block">CANAL</label>
            <select id="channel" name="channel" defaultValue={version.channel} className="field">
              <option value="stable">STABLE</option>
              <option value="beta">BETA</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="fileName" className="type-kicker mb-1.5 block">ARQUIVO NO VOLUME</label>
            <input id="fileName" name="fileName" required defaultValue={version.fileName} className="field type-mono" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="checksum" className="type-kicker mb-1.5 block">CHECKSUM (SHA-256)</label>
            <input id="checksum" name="checksum" required defaultValue={version.checksum} className="field type-mono" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="notes" className="type-kicker mb-1.5 block">NOTAS DA VERSÃO</label>
            <textarea id="notes" name="notes" rows={5} defaultValue={version.notes} className="field" />
          </div>
          <button type="submit" className="btn btn--primary chamfer sm:col-span-2">
            SALVAR VERSÃO
          </button>
        </form>
      </Chamfer>
    </>
  )
}
