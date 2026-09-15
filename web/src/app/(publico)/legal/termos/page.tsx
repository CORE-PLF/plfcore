import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { LegalDoc, LegalSection } from '../../_shared'

export const metadata: Metadata = {
  title: 'TERMOS DE USO',
  description: 'Termos de uso da plataforma e do software Resync.',
}

export default function TermosPage() {
  return (
    <LegalDoc kicker="LEGAL" title="TERMOS DE USO" updated="3 de agosto de 2026">
      <LegalSection title="1. O QUE ESTES TERMOS COBREM">
        <p>
          Estes termos regem o uso do site, da conta de usuário e do software {BRAND.name} (o
          "app"), um programa de computador para Windows destinado a diagnóstico e otimização do
          sistema. Ao criar uma conta ou usar o app, você concorda com estes termos.
        </p>
      </LegalSection>

      <LegalSection title="2. O PRODUTO">
        <p>
          O {BRAND.name} é um produto digital: não há envio físico. A entrega acontece por
          download do instalador e emissão de uma chave de licença na sua conta, após a
          confirmação do pagamento.
        </p>
        <p>
          O app lê dados reais do sistema, explica o que encontrou e executa apenas as ações que
          você autorizar. Nenhuma promessa de desempenho específica (FPS, temperatura, velocidade)
          faz parte da oferta — os resultados dependem do estado e do hardware de cada máquina, e
          o próprio app mede o antes e o depois na sua.
        </p>
      </LegalSection>

      <LegalSection title="3. LICENÇA DE USO">
        <p>
          A compra concede uma licença de uso pessoal, limitada, intransferível e não exclusiva,
          pelo período do plano contratado (ou sem prazo, no caso de plano vitalício) e no número
          de dispositivos definido no plano.
        </p>
        <ul>
          <li>A licença é vinculada à sua conta e aos dispositivos ativados nela.</li>
          <li>Você pode desativar um dispositivo e ativar outro, dentro do limite do plano.</li>
          <li>
            É proibido revender, alugar, compartilhar publicamente ou distribuir a chave de
            licença fora dos programas oficiais de revenda.
          </li>
          <li>
            É proibido descompilar, alterar ou contornar os mecanismos de licenciamento do app.
          </li>
        </ul>
        <p>
          Licença "vitalícia" significa sem data de expiração, pelo tempo em que o produto for
          mantido. Não significa suporte eterno a versões futuras do Windows que venham a tornar o
          app tecnicamente inviável.
        </p>
      </LegalSection>

      <LegalSection title="4. CONTA">
        <p>
          Você é responsável por manter a confidencialidade das suas credenciais e por tudo que
          acontece na sua conta. Informe-nos imediatamente sobre qualquer uso não autorizado.
          Contas usadas para fraude, abuso da plataforma ou violação destes termos podem ser
          suspensas ou encerradas, com registro do motivo.
        </p>
      </LegalSection>

      <LegalSection title="5. PAGAMENTO">
        <p>
          Os pagamentos são processados por provedores externos (PIX, cartão ou boleto). Não
          armazenamos dados completos de cartão. A licença é emitida após a confirmação do
          pagamento pelo provedor. Pedidos com suspeita de fraude podem ficar em análise antes da
          emissão.
        </p>
      </LegalSection>

      <LegalSection title="6. REEMBOLSO E CANCELAMENTO">
        <p>
          Você pode desistir da compra em até 7 (sete) dias corridos, conforme o art. 49 do Código
          de Defesa do Consumidor, com reembolso integral e revogação da licença. As condições
          completas estão na{' '}
          <Link href="/legal/reembolso" className="text-ink-1 underline">
            política de reembolso
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="7. USO DO APP E RESPONSABILIDADE">
        <p>
          O app explica cada ação antes de executá-la, registra tudo no LOG e oferece
          reversão quando o Windows permite. Ainda assim, a decisão de aplicar uma otimização é
          sua. Recomendamos manter backups do que é importante — recomendação válida para qualquer
          software que altera configurações do sistema.
        </p>
        <p>
          Na extensão máxima permitida pela lei, nossa responsabilidade por danos indiretos fica
          limitada ao valor pago pela licença nos 12 meses anteriores ao evento. Nada nestes
          termos exclui responsabilidades que a lei brasileira não permite excluir.
        </p>
      </LegalSection>

      <LegalSection title="8. PROPRIEDADE INTELECTUAL">
        <p>
          O software, a marca {BRAND.name}, o site e todo o conteúdo associado são protegidos por
          direito autoral e demais leis de propriedade intelectual. A licença de uso não
          transfere nenhum direito de propriedade.
        </p>
      </LegalSection>

      <LegalSection title="9. ALTERAÇÕES DESTES TERMOS">
        <p>
          Podemos atualizar estes termos. Mudanças relevantes serão comunicadas na plataforma com
          antecedência razoável, e a data de última atualização no topo desta página sempre
          reflete a versão vigente. O uso continuado após a vigência vale como concordância.
        </p>
      </LegalSection>

      <LegalSection title="10. LEI APLICÁVEL E FORO">
        <p>
          Estes termos são regidos pela lei brasileira. Fica eleito o foro do domicílio do
          consumidor para dirimir controvérsias, como garante o Código de Defesa do Consumidor.
        </p>
      </LegalSection>
    </LegalDoc>
  )
}
