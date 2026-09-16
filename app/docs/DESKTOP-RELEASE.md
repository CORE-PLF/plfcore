# Release do desktop

O cliente recebe somente `PLFCoreSetup.exe`. O instalador NSIS contém o aplicativo e os recursos necessários; a licença é solicitada na primeira abertura.

## Contrato de segurança

- O endereço da API é compilado no binário por `PLFCORE_API_BASE_URL`.
- Release aceita apenas HTTPS.
- HWID é SHA-256 de um namespace do produto mais o `MachineGuid` da instalação.
- O identificador bruto não sai do computador.
- A key é enviada uma vez, na ativação.
- O `deviceToken` fica no Windows Credential Manager e não é devolvido à WebView.
- O app valida no boot e envia heartbeat a cada 15 minutos.
- Sem rede, uma validação anterior vale por até 72 horas; retrocesso relevante do relógio cancela a tolerância offline.

## Gerar o único arquivo de entrega

Execute em PowerShell a partir da raiz:

```powershell
.\scripts\build-desktop-release.ps1 -ApiBaseUrl 'https://SEU-DOMINIO'
```

O resultado fica em:

- `artifacts\PLFCoreSetup.exe`
- `artifacts\PLFCoreSetup.sha256`

O script falha se o instalador não tiver assinatura Authenticode válida. Para um piloto controlado, e somente enquanto a assinatura comercial não estiver disponível:

```powershell
.\scripts\build-desktop-release.ps1 -ApiBaseUrl 'https://SEU-DOMINIO' -AllowUnsigned
```

Publique somente o `.exe`. O `.sha256` serve para preencher `INSTALLER_SHA256` no Coolify e para conferência administrativa.

## Assinatura de código (Authenticode)

Sem assinatura o SmartScreen mostra "editor desconhecido" na primeira execução e o usuário precisa de dois cliques extras para instalar. Nenhum certificado, senha ou `.pfx` entra no repositório — o `.gitignore` já bloqueia `*.pfx`, `*.p12`, `*.pem` e `*.key`.

Desde 2023 as CAs entregam certificado de code signing (OV e EV) somente em token físico ou HSM, então há dois caminhos:

**A. Certificado no repositório de certificados do Windows (token USB ou `.pfx` legado)**

1. Importar uma vez na máquina de build, fora do repositório:
   `certutil -user -importPFX C:\caminho\fora\do\repo\plfcore.pfx`
2. Copiar a impressão digital SHA-1 do certificado:
   `Get-ChildItem Cert:\CurrentUser\My | Format-List Subject, Thumbprint`
3. Em `src-tauri/tauri.conf.json`, dentro de `bundle`:

```json
"windows": {
  "certificateThumbprint": "IMPRESSAO_DIGITAL_SHA1_SEM_ESPACOS",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

O carimbo de tempo (`timestampUrl`) é obrigatório: sem ele a assinatura morre junto com a validade do certificado. Se o provedor usar RFC 3161, acrescentar `"tsp": true`.

**B. Assinatura em nuvem (Azure Trusted Signing, DigiCert KeyLocker, SSL.com eSigner)**

Sem `.pfx` local. O comando do provedor entra em `bundle.windows.signCommand`, com `%1` no lugar do caminho do binário:

```json
"windows": {
  "signCommand": "ferramenta-do-provedor sign %1"
}
```

Credenciais do provedor ficam em variáveis de ambiente da máquina de build, nunca no arquivo de configuração.

Com qualquer um dos dois caminhos configurado, `build-desktop-release.ps1` roda sem `-AllowUnsigned` e a verificação Authenticode passa sozinha. Confirmar depois em Propriedades > Assinaturas Digitais do `PLFCoreSetup.exe`.

## Publicar a versão no painel

O app não se publica sozinho: quem serve o download é o site (`/admin/versoes` exige login de ADMIN com 2FA). Com `artifacts\PLFCoreSetup.exe` e `artifacts\PLFCoreSetup.sha256` em mãos:

1. Hospedar o `.exe`. O formulário do painel pede uma **URL de download** (`downloadUrl`), não um upload — o arquivo precisa estar acessível em uma URL estável antes do cadastro. Se o site já tiver ganhado upload/rota protegida de instalador, usar essa via em vez da URL externa.
2. Em `/admin/versoes`, bloco NOVA VERSÃO:
   - VERSÃO: `1.0.0` (igual ao `version` de `tauri.conf.json`; o campo é único no banco)
   - CANAL: `STABLE`
   - URL DE DOWNLOAD: a URL do passo 1
   - CHECKSUM: o conteúdo de `artifacts\PLFCoreSetup.sha256` (hex minúsculo, sem prefixo `sha256:`)
   - NOTAS: o que entra nesta versão
3. CRIAR VERSÃO. Ela nasce **não publicada** (`active: false`).
4. Clicar em PUBLICAR na linha da versão. A partir daí `/download` passa a mostrá-la e `GET /api/v1/app/download` passa a devolvê-la.
5. Baixar pelo próprio site e conferir a integridade antes de divulgar:
   `Get-FileHash .\PLFCoreSetup.exe -Algorithm SHA256` — precisa bater com o checksum cadastrado.

Para testar a ponta a ponta: emitir uma key em `/admin/licencas` > CONCEDER LICENÇA MANUAL, instalar o `PLFCoreSetup.exe` e colar a key na tela de ativação. O download pelo site exige login; a rota `/api/v1/app/download` exige `X-License-Key` válida.

## Atualizar quem já instalou

O mesmo `PLFCoreSetup.exe` serve para instalação nova e para atualização — não existe instalador separado de update. Ao rodar em uma máquina que já tem o PLF CORE, o instalador detecta a instalação anterior pela chave de desinstalação e abre uma página com duas opções:

- **Desinstalar a versão antiga antes de instalar** — atualização limpa, recomendada.
- **Não desinstalar** — instala por cima, mantendo a pasta.

Nos dois casos a licença ativada continua valendo: o `deviceToken` fica no Windows Credential Manager e nenhum passo do instalador toca nele. Na atualização o instalador também não apaga dados do aplicativo — a opção "apagar dados" só aparece em uma desinstalação avulsa, nunca no meio de um update. O baseline de reversão (`%LOCALAPPDATA%\PLFCore\restore.json`) fica fora da pasta do aplicativo e sobrevive até a uma desinstalação completa.

Publicar a atualização é o mesmo fluxo da seção anterior: nova versão em `/admin/versoes` com o número novo, novo checksum, PUBLICAR. A versão anterior deixa de ser servida assim que a nova entra no ar.

## Teste antes de publicar

1. Instalar em uma VM Windows limpa.
2. Confirmar que o cockpit não aparece sem key.
3. Ativar uma key nova.
4. Fechar e abrir novamente; não deve pedir a key.
5. Suspender a licença no admin e aguardar/forçar nova validação.
6. Confirmar bloqueio.
7. Testar key já consumida em outra instalação.
8. Testar sem internet depois de uma validação válida.
9. Conferir assinatura em Propriedades > Assinaturas Digitais.
10. Calcular novamente o SHA-256 depois do upload e comparar com o painel.

## Itens que nunca entram no instalador

- `.env`
- chave privada do updater
- token do Mercado Pago
- segredo de webhook
- credenciais do banco
- license keys de clientes
