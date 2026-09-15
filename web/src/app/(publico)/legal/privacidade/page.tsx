import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { LegalDoc, LegalSection } from '../../_shared'

export const metadata: Metadata = {
  title: 'PRIVACIDADE',
  description:
    'Política de privacidade do PLF CORE: quais dados o site coleta, para quê, por quanto tempo e quais são os seus direitos (LGPD).',
}

export default function PrivacidadePage() {
  return (
    <LegalDoc kicker="LEGAL" title="Política de privacidade" updated="3 de agosto de 2026">
      <LegalSection title="1. ESCOPO">
        <p>
          Esta política descreve os dados pessoais tratados pelo SITE e pela plataforma de contas
          do {BRAND.name}, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD).
        </p>
        <p>
          Importante: as leituras de hardware feitas pelo APP (uso de CPU, temperaturas etc.) e o
          histórico do LOG ficam armazenados localmente, na sua máquina. O app se comunica
          com nossos servidores apenas para validar a licença — chave, identificador do
          dispositivo (HWID) e versão do app. A metodologia completa está em{' '}
          <Link href="/transparencia" className="text-ink-1 underline">
            transparência
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. DADOS QUE COLETAMOS">
        <ul>
          <li>
            Conta: nome, e-mail, senha (armazenada apenas como hash), idioma e, se você vincular,
            identificador e nome de usuário do Discord.
          </li>
          <li>
            Pedidos e pagamentos: plano, valores, estado do pedido e referências do provedor de
            pagamento. Dados completos de cartão ficam com o provedor — nunca conosco.
          </li>
          <li>
            Licenças e dispositivos: chave (cifrada), estado, datas e identificador dos
            dispositivos ativados (HWID).
          </li>
          <li>Downloads: versão baixada, data e endereço IP.</li>
          <li>Sessões de acesso: IP, navegador (user-agent) e datas — seu histórico de login.</li>
          <li>Suporte: conteúdo dos tickets que você abrir.</li>
          <li>
            Programa de afiliados: cliques em links de afiliado registram IP em forma de hash
            (não reversível), user-agent e página de destino, para atribuição de comissão.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. PARA QUE USAMOS (FINALIDADE E BASE LEGAL)">
        <ul>
          <li>Executar o contrato: emitir e validar licenças, processar pedidos, dar suporte.</li>
          <li>Cumprir obrigações legais: retenção fiscal e contábil de registros de venda.</li>
          <li>
            Prevenir fraude e proteger a plataforma (legítimo interesse): análise de pedidos,
            limites de tentativa, auditoria de ações sensíveis.
          </li>
          <li>
            Comunicar o que é essencial ao serviço (confirmações, licença, avisos de conta).
            Comunicação não essencial só com o seu opt-in, revogável a qualquer momento.
          </li>
        </ul>
        <p>Não vendemos dados pessoais. Ponto.</p>
      </LegalSection>

      <LegalSection title="4. COM QUEM COMPARTILHAMOS">
        <ul>
          <li>Provedor de pagamento, para processar a transação que você iniciou.</li>
          <li>Discord, apenas se você vincular sua conta (cargo no servidor e avisos por DM).</li>
          <li>Infraestrutura de hospedagem, na medida técnica necessária.</li>
          <li>Autoridades, quando a lei exigir.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. COOKIES">
        <ul>
          <li>Cookie de sessão (essencial): mantém você logado. Sem ele, não há conta.</li>
          <li>
            Cookie de afiliado: registra por até 30 dias qual link de indicação trouxe você, para
            atribuição de comissão.
          </li>
        </ul>
        <p>Não usamos cookies de publicidade de terceiros.</p>
      </LegalSection>

      <LegalSection title="6. POR QUANTO TEMPO GUARDAMOS">
        <ul>
          <li>Dados de conta: enquanto a conta existir.</li>
          <li>
            Registros de pedidos e notas: pelo prazo fiscal e contábil exigido em lei (em regra, 5
            anos).
          </li>
          <li>Sessões e logs de acesso: por período limitado, para segurança e auditoria.</li>
        </ul>
        <p>
          Ao excluir a conta, removemos ou anonimizamos os dados pessoais que não formos legalmente
          obrigados a reter.
        </p>
      </LegalSection>

      <LegalSection title="7. SEUS DIREITOS (LGPD)">
        <p>Você pode, a qualquer momento, solicitar:</p>
        <ul>
          <li>Confirmação de tratamento e acesso aos seus dados;</li>
          <li>Correção de dados incompletos ou desatualizados;</li>
          <li>Exclusão dos dados dispensáveis (respeitada a retenção legal);</li>
          <li>Portabilidade;</li>
          <li>Informação sobre compartilhamentos;</li>
          <li>Revogação de consentimentos.</li>
        </ul>
        <p>
          O canal para exercer esses direitos é um{' '}
          <Link href="/painel/suporte" className="text-ink-1 underline">
            ticket no painel
          </Link>
          . Respondemos nos prazos da LGPD.
        </p>
      </LegalSection>

      <LegalSection title="8. SEGURANÇA">
        <p>
          Senhas são armazenadas apenas como hash. Chaves de licença ficam cifradas no banco.
          Ações administrativas sensíveis geram registro de auditoria. Nenhum sistema é
          invulnerável — em caso de incidente com risco relevante, comunicaremos os afetados e a
          autoridade competente, como manda a lei.
        </p>
      </LegalSection>

      <LegalSection title="9. CONTROLADOR E CONTATO">
        <p>
          O controlador dos dados é o operador da plataforma {BRAND.name}. Para qualquer assunto
          desta política, abra um{' '}
          <Link href="/painel/suporte" className="text-ink-1 underline">
            ticket no painel
          </Link>
          .
        </p>
      </LegalSection>
    </LegalDoc>
  )
}
