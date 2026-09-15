import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Chamfer, Kicker, RuleFade } from '@/components/ui'

export const metadata: Metadata = {
  title: 'API do aplicativo',
  description: 'Referência da API v1: ativação, validação e atualização de licenças.',
}

const ENDPOINTS = [
  { method: 'POST', path: '/api/v1/licenses/activate', auth: 'chave no corpo', desc: 'Ativa a licença e vincula a instalação (hwid). Primeira ativação liga o relógio de expiração e devolve o deviceToken.' },
  { method: 'POST', path: '/api/v1/licenses/validate', auth: 'deviceToken no corpo', desc: 'Valida licença e vínculo da instalação. Atualiza lastValidatedAt.' },
  { method: 'POST', path: '/api/v1/licenses/heartbeat', auth: 'deviceToken no corpo', desc: 'Batimento leve com o app aberto. Atualiza lastSeenAt e appVersion.' },
  { method: 'POST', path: '/api/v1/licenses/deactivate', auth: 'chave no corpo', desc: 'Revoga o dispositivo. Fluxo excepcional, sob orientação do suporte — troca de instalação exige nova licença.' },
  { method: 'GET', path: '/api/v1/app/version', auth: 'nenhuma', desc: 'Última versão publicada no canal stable: versão, notas, checksum.' },
  { method: 'GET', path: '/api/v1/app/download', auth: 'header X-License-Key', desc: 'URL direta do instalador + checksum. Sem redirect: o app baixa.' },
  { method: 'GET', path: '/api/v1/status', auth: 'nenhuma', desc: 'Saúde do serviço e do banco. Retorna serverTime (UTC).' },
] as const

const ERRORS = [
  { code: 'ERR_INVALID_BODY', http: '400', desc: 'Corpo ausente, JSON malformado ou campo inválido — inclui hwid que não é SHA-256 de 64 hex.' },
  { code: 'ERR_LICENSE_KEY_REQUIRED', http: '401', desc: 'Header X-License-Key ausente no download.' },
  { code: 'ERR_LICENSE_EXPIRED', http: '403', desc: 'Licença expirada. Renovar no painel.' },
  { code: 'ERR_LICENSE_SUSPENDED', http: '403', desc: 'Licença suspensa. Abrir chamado no suporte.' },
  { code: 'ERR_LICENSE_REVOKED', http: '403', desc: 'Licença revogada.' },
  { code: 'ERR_LICENSE_BLOCKED', http: '403', desc: 'Licença bloqueada.' },
  { code: 'ERR_DEVICE_REVOKED', http: '403', desc: 'Este dispositivo foi desativado para a licença.' },
  { code: 'ERR_DEVICE_NOT_BOUND', http: '403', desc: 'deviceToken inválido/revogado ou hwid diferente do vinculado. Executar a ativação.' },
  { code: 'ERR_LICENSE_NOT_FOUND', http: '404', desc: 'Chave não encontrada.' },
  { code: 'ERR_NO_VERSION', http: '404', desc: 'Nenhuma versão do app publicada.' },
  { code: 'ERR_INSTALLATION_ALREADY_CONSUMED', http: '409', desc: 'Ativação com a chave já consumida por OUTRA instalação do Windows (formatação ou outro computador). Solução: nova licença no painel.' },
  { code: 'ERR_DEVICE_LIMIT', http: '409', desc: 'Licença multi-dispositivo (deviceLimit > 1) com todas as vagas em uso.' },
  { code: 'ERR_LICENSE_REPLACED', http: '410', desc: 'Chave substituída. Usar a chave nova do painel.' },
  { code: 'ERR_APP_OUTDATED', http: '426', desc: 'Versão do app abaixo da mínima exigida pela licença.' },
  { code: 'ERR_RATE_LIMITED', http: '429', desc: 'Limite de requisições por IP + chave excedido.' },
  { code: 'ERR_INTERNAL', http: '500', desc: 'Falha interna. Tentar novamente.' },
] as const

const PSEUDO_HWID = `# Pseudocódigo — geração do hwid NO APLICATIVO
# Fonte: identificador da instalação que MUDA ao formatar o Windows.
machineGuid = registro.ler("HKLM\\SOFTWARE\\Microsoft\\Cryptography", "MachineGuid")

hwid = sha256_hex(machineGuid)   # 64 caracteres [0-9a-f]

# NUNCA usar identificador bruto que sobrevive à formatação
# (serial de placa-mãe, serial de disco, MAC) nem enviar o
# MachineGuid em claro — o servidor rejeita com ERR_INVALID_BODY.`

const CURL_ACTIVATE = `curl -X POST https://SEU-DOMINIO/api/v1/licenses/activate \\
  -H "Content-Type: application/json" \\
  -d '{
    "key": "RESYNC-A2C4-E6G8-J3KL-MN57",
    "hwid": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "deviceName": "DESKTOP-GAMER",
    "appVersion": "1.2.0"
  }'

# 200 — guarde o deviceToken: validate e heartbeat autenticam por ele
{
  "deviceToken": "Xk3P9mQvR7tW2yZ5aB8cD1eF4gH6jL0nS-uV_wA9bC2d",
  "status": "ACTIVE",
  "plan": { "slug": "anual", "name": "Plano Anual" },
  "expiresAt": "2027-08-03T12:00:00.000Z",
  "deviceLimit": 1,
  "devices": 1
}

# 409 — chave já consumida por outra instalação (ex.: Windows formatado)
{
  "error": {
    "code": "ERR_INSTALLATION_ALREADY_CONSUMED",
    "message": "Esta chave já foi consumida por outra instalação do Windows. Após formatar ou trocar de computador é preciso adquirir uma nova licença no painel."
  }
}`

const CURL_VALIDATE = `curl -X POST https://SEU-DOMINIO/api/v1/licenses/validate \\
  -H "Content-Type: application/json" \\
  -d '{
    "token": "Xk3P9mQvR7tW2yZ5aB8cD1eF4gH6jL0nS-uV_wA9bC2d",
    "hwid": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
  }'

# 200
{
  "status": "ACTIVE",
  "plan": { "slug": "anual", "name": "Plano Anual" },
  "expiresAt": "2027-08-03T12:00:00.000Z",
  "serverTime": "2026-08-03T15:30:00.000Z"
}

# 403
{
  "error": {
    "code": "ERR_DEVICE_NOT_BOUND",
    "message": "Dispositivo não vinculado a esta licença. Execute a ativação neste computador."
  }
}`

const CURL_DOWNLOAD = `curl https://SEU-DOMINIO/api/v1/app/download \\
  -H "X-License-Key: RESYNC-A2C4-E6G8-J3KL-MN57"

# 200
{
  "url": "https://cdn.example.com/resync/resync-setup-1.2.0.exe",
  "checksum": "3b0c44298fc1c149afbf4c8996fb92427ae41e...",
  "version": "1.2.0"
}`

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <Chamfer cut={6} className="p-0">
      <p
        className="type-kicker border-b px-4 py-2.5"
        style={{ borderColor: 'var(--color-line)' }}
      >
        {title}
      </p>
      <pre className="type-mono overflow-x-auto px-4 py-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
        {code}
      </pre>
    </Chamfer>
  )
}

export default function DocsApiPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-12">
        <Kicker>PARA INTEGRADORES</Kicker>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">API DO APLICATIVO</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--color-ink-3)' }}>
          A mesma API que o aplicativo desktop usa para ativar, validar e atualizar licenças. Base{' '}
          <code className="type-mono" style={{ color: 'var(--color-ink-1)' }}>/api/v1</code>, requisições e respostas em
          JSON, rate limit por IP + chave de licença. Toda resposta de erro segue o formato{' '}
          <code className="type-mono" style={{ color: 'var(--color-ink-1)' }}>{'{ "error": { "code", "message" } }'}</code>{' '}
          com códigos estáveis.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/openapi.yaml" className="btn btn--primary chamfer">
            ESPECIFICAÇÃO OPENAPI 3.1
          </a>
          <a href="#erros" className="btn btn--ghost chamfer">
            CÓDIGOS DE ERRO
          </a>
        </div>

        <RuleFade className="my-12" />

        <section aria-labelledby="endpoints">
          <h2 id="endpoints" className="type-display text-2xl">
            ENDPOINTS
          </h2>
          <Chamfer cut={8} className="mt-6 p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                    <th className="type-kicker px-4 py-3">MÉTODO</th>
                    <th className="type-kicker px-4 py-3">ROTA</th>
                    <th className="type-kicker px-4 py-3">AUTENTICAÇÃO</th>
                    <th className="type-kicker px-4 py-3">O QUE FAZ</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((e) => (
                    <tr key={e.path} className="border-b align-top" style={{ borderColor: 'var(--color-line)' }}>
                      <td className="type-mono px-4 py-3 text-[12.5px]" style={{ color: 'var(--color-ink-1)' }}>
                        {e.method}
                      </td>
                      <td className="type-mono whitespace-nowrap px-4 py-3 text-[12.5px]" style={{ color: 'var(--color-ink-2)' }}>
                        {e.path}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3" style={{ color: 'var(--color-ink-3)' }}>
                        {e.auth}
                      </td>
                      <td className="min-w-64 px-4 py-3" style={{ color: 'var(--color-ink-3)' }}>
                        {e.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Chamfer>
          <p className="mt-4 max-w-2xl text-sm" style={{ color: 'var(--color-ink-3)' }}>
            O campo <code className="type-mono">serverTime</code> (UTC, ISO 8601) vem nas respostas de validação para o
            aplicativo detectar relógio local adulterado. Guarde a chave de licença como segredo: quem tem a chave usa a
            licença.
          </p>
        </section>

        <RuleFade className="my-12" />

        <section aria-labelledby="hwid">
          <h2 id="hwid" className="type-display text-2xl">
            HWID: IDENTIFICADOR DA INSTALAÇÃO
          </h2>
          <p className="mt-3 max-w-2xl text-sm" style={{ color: 'var(--color-ink-3)' }}>
            A licença é individual e vinculada à instalação do Windows. O campo{' '}
            <code className="type-mono">hwid</code> é obrigatoriamente o SHA-256 (64 caracteres
            hex) calculado no aplicativo sobre um identificador que muda quando o Windows é
            formatado ou reinstalado — por exemplo, o <code className="type-mono">MachineGuid</code>.
            Identificador bruto (serial de placa-mãe, serial de disco, GUID em claro) nunca sai da
            máquina: o servidor só aceita o hash e rejeita qualquer outro formato com{' '}
            <code className="type-mono">ERR_INVALID_BODY</code>.
          </p>
          <div className="mt-6">
            <CodeBlock title="GERAÇÃO DO HWID (PSEUDOCÓDIGO)" code={PSEUDO_HWID} />
          </div>
          <p className="mt-4 max-w-2xl text-sm" style={{ color: 'var(--color-ink-3)' }}>
            Consequência prática: formatar o Windows gera um hwid novo. A chave antiga permanece
            consumida pela instalação original e a ativação na instalação nova responde{' '}
            <code className="type-mono">ERR_INSTALLATION_ALREADY_CONSUMED</code> (HTTP 409) — é
            preciso adquirir uma nova licença no painel.
          </p>
        </section>

        <RuleFade className="my-12" />

        <section aria-labelledby="exemplos">
          <h2 id="exemplos" className="type-display text-2xl">
            EXEMPLOS
          </h2>
          <div className="mt-6 grid gap-6">
            <CodeBlock title="ATIVAR LICENÇA" code={CURL_ACTIVATE} />
            <CodeBlock title="VALIDAR NA ABERTURA DO APP" code={CURL_VALIDATE} />
            <CodeBlock title="DOWNLOAD DO INSTALADOR" code={CURL_DOWNLOAD} />
          </div>
        </section>

        <RuleFade className="my-12" />

        <section aria-labelledby="erros">
          <h2 id="erros" className="type-display text-2xl">
            CÓDIGOS DE ERRO
          </h2>
          <p className="mt-3 max-w-2xl text-sm" style={{ color: 'var(--color-ink-3)' }}>
            Códigos estáveis — trate pelo <code className="type-mono">error.code</code>, nunca pela mensagem. A mensagem
            (pt-BR) diz o que houve e o que fazer.
          </p>
          <Chamfer cut={8} className="mt-6 p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--color-line)' }}>
                    <th className="type-kicker px-4 py-3">CÓDIGO</th>
                    <th className="type-kicker px-4 py-3">HTTP</th>
                    <th className="type-kicker px-4 py-3">SIGNIFICADO</th>
                  </tr>
                </thead>
                <tbody>
                  {ERRORS.map((e) => (
                    <tr key={e.code} className="border-b align-top" style={{ borderColor: 'var(--color-line)' }}>
                      <td className="type-mono whitespace-nowrap px-4 py-2.5 text-[12.5px]" style={{ color: 'var(--color-signal)' }}>
                        {e.code}
                      </td>
                      <td className="type-mono px-4 py-2.5 text-[12.5px]" style={{ color: 'var(--color-ink-2)' }}>
                        {e.http}
                      </td>
                      <td className="min-w-64 px-4 py-2.5" style={{ color: 'var(--color-ink-3)' }}>
                        {e.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Chamfer>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
