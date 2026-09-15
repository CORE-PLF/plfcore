import Link from 'next/link'
import { Chamfer, RuleFade, StatusTag } from '@/components/ui'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { formatCents } from '@/lib/money'
import { CopyButton, InscricaoForm } from './forms'

export default async function AfiliadoPage() {
  const user = await requireUser()
  const affiliate = await db.affiliate.findUnique({ where: { userId: user.id } })

  if (!affiliate) return <Inscricao />
  if (affiliate.status === 'PENDING') return <EmAnalise />
  if (affiliate.status === 'SUSPENDED') return <Suspenso />
  return (
    <Dashboard
      affiliateId={affiliate.id}
      code={affiliate.code}
      commissionBps={affiliate.commissionBps}
      windowDays={affiliate.windowDays}
    />
  )
}

const REGRAS = [
  ['COMISSÃO', 'Padrão de 15% sobre cada venda paga atribuída ao seu link.'],
  ['JANELA', '30 dias após o clique, modelo last-click: vale o último link clicado.'],
  ['APROVAÇÃO', 'A comissão fica PENDENTE até o fim do prazo de reembolso da compra. Depois, aprova.'],
  ['PAGAMENTO', 'Via PIX, mediante solicitação de saque acima do valor mínimo.'],
  ['PROIBIDO', 'Autoindicação (comprar pelo próprio link), spam e mensagens em massa não solicitadas. Violação cancela comissões e suspende a conta.'],
] as const

function Inscricao() {
  return (
    <div className="max-w-2xl">
      <h1 className="type-display text-4xl">INDIQUE. RECEBA.</h1>
      <p className="mt-3 text-ink-2">
        Você divulga seu link exclusivo. Cada venda paga dentro da janela de atribuição gera
        comissão para você. Sem meta, sem pegadinha — as regras estão todas abaixo.
      </p>

      <Chamfer cut={8} className="mt-8 p-5">
        <dl className="space-y-3">
          {REGRAS.map(([termo, descricao]) => (
            <div key={termo} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
              <dt className="type-kicker w-28 shrink-0 pt-0.5">{termo}</dt>
              <dd className="text-[13px] text-ink-2">{descricao}</dd>
            </div>
          ))}
        </dl>
      </Chamfer>

      <RuleFade className="my-8" />

      <h2 className="type-display text-2xl">INSCRIÇÃO</h2>
      <p className="mb-5 mt-2 text-[13px] text-ink-3">
        A inscrição passa por revisão manual antes de o link ser ativado.
      </p>
      <InscricaoForm />
    </div>
  )
}

function EmAnalise() {
  return (
    <div className="max-w-2xl">
      <h1 className="type-display text-4xl">INSCRIÇÃO EM ANÁLISE</h1>
      <Chamfer cut={8} className="mt-6 p-5">
        <StatusTag tone="warn">EM ANÁLISE</StatusTag>
        <p className="mt-4 text-[13px] text-ink-2">
          Sua inscrição foi recebida e está na fila de revisão manual. Enquanto isso, o link de
          afiliado ainda não gera atribuição. Volte aqui para conferir o status.
        </p>
      </Chamfer>
    </div>
  )
}

function Suspenso() {
  return (
    <div className="max-w-2xl">
      <h1 className="type-display text-4xl">CONTA SUSPENSA</h1>
      <Chamfer cut={8} className="mt-6 p-5">
        <StatusTag tone="danger">SUSPENSO</StatusTag>
        <p className="mt-4 text-[13px] text-ink-2">
          Sua conta de afiliado está suspensa: o link não gera atribuição e os saques estão
          bloqueados. Para entender o motivo e pedir revisão, abra um chamado no suporte.
        </p>
        <Link href="/suporte" className="btn btn--ghost btn--sm chamfer mt-5">
          ABRIR CHAMADO
        </Link>
      </Chamfer>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Chamfer cut={6} className="p-4">
      <p className="type-kicker">{label}</p>
      <p className="type-mono mt-2 text-2xl text-ink-1">{value}</p>
    </Chamfer>
  )
}

async function Dashboard({
  affiliateId,
  code,
  commissionBps,
  windowDays,
}: {
  affiliateId: string
  code: string
  commissionBps: number
  windowDays: number
}) {
  const [cliques, cadastros, conversoes, receita, porStatus] = await Promise.all([
    db.affiliateClick.count({ where: { affiliateId } }),
    db.affiliateAttribution.count({ where: { affiliateId } }),
    db.commission.count({ where: { affiliateId } }),
    db.order.aggregate({ where: { affiliateId, status: 'PAID' }, _sum: { totalCents: true } }),
    db.commission.groupBy({
      by: ['status'],
      where: { affiliateId },
      _sum: { amountCents: true },
    }),
  ])

  const somas: Record<string, number> = { PENDING: 0, APPROVED: 0, PAID: 0 }
  for (const g of porStatus) somas[g.status] = g._sum.amountCents ?? 0

  const taxa = cliques > 0 ? ((conversoes / cliques) * 100).toFixed(1).replace('.', ',') : '0,0'
  const pct = (commissionBps / 100).toFixed(commissionBps % 100 === 0 ? 0 : 1).replace('.', ',')
  const link = `${env.APP_URL}/a/${code}`

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="type-display text-4xl">SEU DESEMPENHO</h1>
        <p className="type-mono text-[12px] text-ink-3">
          COMISSÃO {pct}% · JANELA {windowDays} DIAS
        </p>
      </div>

      <Chamfer cut={8} className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="type-kicker">SEU LINK EXCLUSIVO</p>
          <p className="type-mono mt-1 break-all text-ink-1">{link}</p>
        </div>
        <CopyButton text={link} />
      </Chamfer>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="CLIQUES" value={String(cliques)} />
        <Stat label="CADASTROS ATRIBUÍDOS" value={String(cadastros)} />
        <Stat label="CONVERSÕES" value={String(conversoes)} />
        <Stat label="TAXA DE CONVERSÃO" value={`${taxa}%`} />
        <Stat label="RECEITA GERADA" value={formatCents(receita._sum.totalCents ?? 0)} />
        <Stat label="COMISSÃO PENDENTE" value={formatCents(somas.PENDING)} />
        <Stat label="COMISSÃO APROVADA" value={formatCents(somas.APPROVED)} />
        <Stat label="COMISSÃO PAGA" value={formatCents(somas.PAID)} />
      </div>

      <p className="mt-4 text-[12px] text-ink-4">
        Todos os números vêm direto do banco de dados — nada é estimado nem projetado.
      </p>
    </div>
  )
}
