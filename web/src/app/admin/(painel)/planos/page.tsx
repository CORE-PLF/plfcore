import Link from 'next/link'
import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { StatusTag } from '@/components/ui'
import { Flash, PageTitle, Table, Td, type SP } from '../../_ui'

export default async function AdminPlansPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff('ADMIN')
  const sp = await searchParams

  const products = await db.product.findMany({
    include: {
      plans: {
        include: { prices: { where: { currency: 'BRL' } }, _count: { select: { orders: true, licenses: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <>
      <PageTitle kicker="PLANOS" title="CATÁLOGO E PREÇOS">
        <Link href="/admin/planos/novo" className="btn btn--primary btn--sm chamfer">
          NOVO PLANO
        </Link>
      </PageTitle>
      <Flash sp={sp} />

      {products.map((product) => (
        <section key={product.id} className="mb-8">
          <h2 className="type-kicker mb-3">
            PRODUTO: {product.name} ({product.slug}) {product.active ? '' : '— INATIVO'}
          </h2>
          {product.plans.length === 0 ? (
            <p className="type-mono text-[12px] text-ink-3">Nenhum plano neste produto.</p>
          ) : (
            <Table head={['PLANO', 'SLUG', 'DURAÇÃO', 'DISPOSITIVOS', 'PREÇO', 'DESTAQUE', 'ATIVO', 'VENDAS', '']}>
              {product.plans.map((p) => (
                <tr key={p.id}>
                  <Td className="text-ink-1">{p.name}</Td>
                  <Td>{p.slug}</Td>
                  <Td>{p.durationDays === null ? 'VITALÍCIO' : `${p.durationDays} DIAS`}</Td>
                  <Td>{p.deviceLimit}</Td>
                  <Td className="text-ink-1">
                    {p.prices[0] ? formatCents(p.prices[0].amountCents) : 'SEM PREÇO'}
                  </Td>
                  <Td>{p.featured ? 'SIM' : '—'}</Td>
                  <Td>
                    <StatusTag tone={p.active ? 'ok' : 'muted'}>{p.active ? 'ATIVO' : 'INATIVO'}</StatusTag>
                  </Td>
                  <Td>{p._count.orders}</Td>
                  <Td>
                    <Link href={`/admin/planos/${p.id}`} className="btn btn--ghost btn--sm chamfer">
                      EDITAR
                    </Link>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </section>
      ))}
    </>
  )
}
