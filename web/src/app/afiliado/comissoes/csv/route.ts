import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { comissaoStatus, dataSp, periodoWhere, requireApprovedAffiliate } from '../../shared'

const BOM = String.fromCharCode(0xfeff)
const CRLF = String.fromCharCode(13, 10)

// CSV com ; e BOM — abre direto no Excel pt-BR.
export async function GET(req: Request) {
  const { affiliate } = await requireApprovedAffiliate()
  const url = new URL(req.url)
  const createdAt = periodoWhere(
    url.searchParams.get('de') ?? undefined,
    url.searchParams.get('ate') ?? undefined,
  )

  const comissoes = await db.commission.findMany({
    where: { affiliateId: affiliate.id, ...(createdAt ? { createdAt } : {}) },
    include: { order: { select: { status: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const linhas = [
    ['pedido', 'data', 'valor_centavos', 'valor', 'status', 'detalhe'],
    ...comissoes.map((c) => {
      const s = comissaoStatus(c.status, c.order.status, c.approvesAt)
      return [
        c.orderId,
        dataSp(c.createdAt),
        String(c.amountCents),
        formatCents(c.amountCents),
        s.label,
        s.detail,
      ]
    }),
  ]
  const csv = BOM + linhas.map((l) => l.map(esc).join(';')).join(CRLF)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="comissoes.csv"',
    },
  })
}
