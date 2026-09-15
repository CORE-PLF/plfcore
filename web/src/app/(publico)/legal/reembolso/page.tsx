import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDoc, LegalSection } from '../../_shared'

export const metadata: Metadata = {
  title: 'REEMBOLSO',
  description: 'Política de reembolso da Resync: 7 dias de arrependimento, como pedir e prazos.',
}

export default function ReembolsoPage() {
  return (
    <LegalDoc kicker="LEGAL" title="POLÍTICA DE REEMBOLSO" updated="3 de agosto de 2026">
      <LegalSection title="1. DIREITO DE ARREPENDIMENTO — 7 DIAS">
        <p>
          Por se tratar de compra fora de estabelecimento comercial, você pode desistir em até 7
          (sete) dias corridos a partir da confirmação do pagamento, sem precisar justificar,
          conforme o art. 49 do Código de Defesa do Consumidor. O reembolso é integral.
        </p>
      </LegalSection>

      <LegalSection title="2. COMO PEDIR">
        <ul>
          <li>Abra um ticket no painel com o número do pedido e o pedido de reembolso.</li>
          <li>Não pedimos justificativa dentro do prazo de 7 dias — mas feedback ajuda.</li>
          <li>Confirmamos o recebimento e iniciamos o estorno.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. O QUE ACONTECE DEPOIS">
        <ul>
          <li>A licença associada ao pedido é revogada e o app deixa de validá-la.</li>
          <li>
            O estorno é feito pelo mesmo meio de pagamento da compra: devolução do PIX, estorno na
            fatura do cartão ou devolução do valor do boleto (neste caso, informamos como).
          </li>
          <li>
            Do nosso lado, o estorno é comandado em até 5 dias úteis após a confirmação. O prazo
            para o valor aparecer para você depende do provedor e do banco — estorno de cartão
            pode levar uma ou duas faturas.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. DEPOIS DOS 7 DIAS">
        <p>
          Passado o prazo legal, reembolsos são analisados caso a caso — por exemplo, quando há
          defeito que impede o uso e que nosso suporte não conseguiu resolver. Abra um ticket
          descrevendo o problema; a resposta dirá o que é possível e por quê.
        </p>
      </LegalSection>

      <LegalSection title="5. CHARGEBACK">
        <p>
          Se algo deu errado, fale com a gente antes de abrir disputa no banco: o reembolso pelo
          ticket é mais rápido que um chargeback. Disputas abertas sem contato prévio suspendem a
          licença durante a análise, e contas com padrão de fraude podem ser encerradas.
        </p>
      </LegalSection>

      <LegalSection title="6. COMISSÕES E REVENDA">
        <p>
          Pedido reembolsado cancela a comissão de afiliado associada (por isso comissões só são
          aprovadas após o prazo de reembolso). Licenças emitidas por revendedores seguem as regras
          da{' '}
          <Link href="/legal/afiliados-revendedores" className="text-ink-1 underline">
            política de afiliados e revenda
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDoc>
  )
}
