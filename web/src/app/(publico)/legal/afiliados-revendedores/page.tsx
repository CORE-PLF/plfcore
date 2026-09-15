import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDoc, LegalSection } from '../../_shared'

export const metadata: Metadata = {
  title: 'POLÍTICA DE AFILIADOS E REVENDA',
  description:
    'Regras dos programas de afiliados e revendedores do PLF CORE: comissões, atribuição, fraude, créditos e limites.',
}

export default function AfiliadosRevendedoresPage() {
  return (
    <LegalDoc
      kicker="LEGAL"
      title="Política de afiliados e revenda"
      updated="3 de agosto de 2026"
    >
      <LegalSection title="1. PARTICIPAÇÃO">
        <p>
          Os programas de afiliados e de revenda exigem conta na plataforma e inscrição própria,
          sujeita a aprovação. Podemos recusar ou encerrar a participação de contas que violem
          esta política, com registro do motivo.
        </p>
      </LegalSection>

      <LegalSection title="2. AFILIADOS — COMISSÃO E ATRIBUIÇÃO">
        <ul>
          <li>
            A comissão é um percentual sobre o valor efetivamente pago em cada pedido atribuído ao
            afiliado. O percentual da sua conta (padrão de 15%) aparece no painel.
          </li>
          <li>
            Atribuição por last-click com janela de 30 dias: vale o último link de afiliado
            clicado pelo comprador antes da compra, dentro da janela.
          </li>
          <li>Cupons vinculados ao afiliado também geram atribuição, conforme o painel.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. AFILIADOS — APROVAÇÃO E PAGAMENTO">
        <ul>
          <li>
            A comissão nasce PENDENTE e é aprovada automaticamente após o fim do prazo de
            reembolso do pedido. Pedido reembolsado, cancelado ou com chargeback cancela a
            comissão.
          </li>
          <li>
            Comissões aprovadas compõem o saldo sacável. O saque é solicitado no painel e pago via
            PIX na chave informada.
          </li>
          <li>Impostos sobre os valores recebidos são responsabilidade do afiliado.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. FRAUDE — O QUE CANCELA COMISSÃO E CONTA">
        <ul>
          <li>Autoindicação: usar o próprio link ou o próprio cupom em compra própria.</li>
          <li>Compras com cartões fraudados, contas falsas ou reembolso combinado.</li>
          <li>Spam, cliques incentivados artificialmente ou automação de cliques.</li>
          <li>
            Anunciar-se como página oficial do produto ou usar a marca de forma que confunda o
            comprador sobre quem está vendendo.
          </li>
          <li>Promessas de desempenho que o produto não faz — a honestidade da marca vale para a divulgação também.</li>
        </ul>
        <p>
          Violação comprovada cancela comissões pendentes, pode reverter comissões pagas
          relacionadas à fraude e encerra a conta do programa.
        </p>
      </LegalSection>

      <LegalSection title="5. REVENDA — MODELO DE CRÉDITOS">
        <ul>
          <li>
            O revendedor compra créditos pré-pagos e os consome ao emitir licenças, pelo preço de
            tabela menos o desconto do seu nível, definido em contrato.
          </li>
          <li>
            Cada movimento de crédito fica registrado em extrato (compra, emissão, ajuste,
            reembolso). O extrato do painel é a referência.
          </li>
          <li>Cada conta tem limites diário e mensal de emissão, visíveis no painel.</li>
          <li>Créditos não são resgatáveis em dinheiro, salvo encerramento do programa por nossa iniciativa.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. REVENDA — RESPONSABILIDADES">
        <ul>
          <li>
            As licenças emitidas seguem os{' '}
            <Link href="/legal/termos" className="text-ink-1 underline">
              termos de uso
            </Link>{' '}
            do produto. O revendedor não pode alterar o que o produto é nem prometer o que ele não
            faz.
          </li>
          <li>
            O revendedor é responsável pela relação comercial com o cliente final dele, incluindo
            emissão de documentos fiscais da venda dele.
          </li>
          <li>
            Suspeita de fraude (chaves vazadas, revenda fora do combinado, chargeback em série)
            suspende a conta durante a apuração.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. ALTERAÇÕES">
        <p>
          Percentuais, níveis e limites de contas específicas são definidos em contrato ou no
          painel. Mudanças nesta política valem para o futuro e serão comunicadas com
          antecedência razoável — nunca retroativamente sobre comissão já aprovada.
        </p>
      </LegalSection>
    </LegalDoc>
  )
}
