import { Chamfer, StatusTag } from '@/components/ui'
import { env } from '@/lib/env'
import { PixForm } from '../forms'
import { pixDe, requireApprovedAffiliate } from '../shared'

export default async function ConfigPage() {
  const { affiliate } = await requireApprovedAffiliate()

  return (
    <div className="max-w-2xl">
      <h1 className="type-display text-4xl">CONFIGURAÇÃO</h1>

      <Chamfer cut={8} className="mt-6 p-5">
        <p className="type-kicker">SEU CÓDIGO</p>
        <p className="type-mono mt-1 text-2xl text-ink-1">{affiliate.code}</p>
        <p className="type-mono mt-1 break-all text-[12px] text-ink-3">
          {env.APP_URL}/a/{affiliate.code}
        </p>
        <p className="mt-3 text-[12px] text-ink-4">
          O código é imutável após a aprovação — links já divulgados nunca quebram.
        </p>
      </Chamfer>

      <div className="mt-8">
        <h2 className="type-display mb-2 text-xl">RECEBIMENTO</h2>
        <p className="mb-4 text-[12px] text-ink-4">
          Chave usada como padrão nos saques. Toda alteração fica registrada em auditoria.
        </p>
        <PixForm pixAtual={pixDe(affiliate)} />
      </div>

      <Chamfer cut={8} className="mt-8 p-5">
        <StatusTag tone="warn">REGRAS ANTIFRAUDE</StatusTag>
        <ul className="mt-4 space-y-2 text-[13px] text-ink-2">
          <li>— Autoindicação (comprar pelo próprio link ou por conta ligada a você) cancela a comissão.</li>
          <li>— Spam, mensagens em massa não solicitadas e divulgação enganosa suspendem a conta.</li>
          <li>— Cliques, atribuições e comissões são auditados; padrões anormais entram em revisão manual.</li>
          <li>— Comissão de pedido reembolsado ou com chargeback é cancelada, mesmo depois de aprovada.</li>
        </ul>
      </Chamfer>
    </div>
  )
}
