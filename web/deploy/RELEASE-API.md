# Esteira de release — credencial de máquina

Publicar versão do app desktop sem passar pelo painel: o `RELEASE_TOKEN` autentica uma esteira automatizada, para que uma pessoa não precise refazer a 2FA a cada publicação.

O painel continua exigindo ADMIN + 2FA. Nada aqui enfraquece isso — este é um caminho **separado e estreito**, não um atalho para o painel.

## O que o token pode, e o que não pode

Pode, e só:

1. `POST /api/v1/release/upload?name=<arquivo>` — grava o instalador no volume e devolve o SHA-256 do que foi gravado.
2. `POST /api/v1/release` — cria a versão e publica, conferindo o SHA-256 contra o arquivo no volume.

Não enxerga licença, pedido, pagamento, reembolso, usuário, repasse de afiliado nem configuração. Não existe rota de leitura: o token não serve para vazar nada, só para publicar.

Sem `RELEASE_TOKEN` no ambiente as duas rotas respondem **404** — em uma instalação que não usa esteira, elas não existem.

## Travas

- **Token comparado em tempo constante** (`timingSafeEqual`), mínimo de 32 caracteres recusado no boot.
- **O SHA-256 é recalculado a partir do arquivo no volume** e comparado com o declarado. Divergiu, nada é salvo — nem que o upload tenha dado certo. É o que impede publicar um binário diferente do que foi conferido.
- **Número de versão nunca recebe conteúdo diferente.** Republicar o mesmo número com outro binário deixaria quem já atualizou com uma versão que o servidor jura ser outra, e o aviso de atualização nunca mais acenderia.
- **Teto de 200 MB** e nome de arquivo restrito (sem barra, sem `..`).
- **Rate limit** de 10 por minuto por IP.
- **Tudo auditado** em `AuditLog` com ação `release_api.*` e `actorUserId` nulo — dá para separar o que foi esteira do que foi gente.

Quem tem este token publica um `.exe` que as pessoas rodam como administrador. Trate como senha de produção: só no ambiente, nunca no repositório, nunca em mensagem.

## Configurar

**1. Gerar o token** (não reaproveite senha de nada; 48 bytes):

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

**2. Coolify** → aplicação `plfcore-web` → *Environment Variables* → nova variável:

```
RELEASE_TOKEN=<o valor gerado>
```

Marque como **build-time? Não** — é lida em runtime. Faça *Redeploy* para a variável entrar.

> O `worker` não precisa dela.

**3. Máquina que publica** (a mesma onde o repositório está), variável de usuário — não vai para o repositório:

```powershell
setx PLFCORE_RELEASE_TOKEN "<o mesmo valor>"
```

Abra um terminal novo depois do `setx`: a variável só existe em processos criados depois.

**4. Conferir** — sem token, tem que dar 401; com token errado, 401; sem a variável no servidor, 404:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://core.proleague.com.br/api/v1/release
```

## Revogar

Troque `RELEASE_TOKEN` no Coolify e faça redeploy. O token antigo morre na hora. Se suspeitar de vazamento, revogue **antes** de investigar, e confira `AuditLog` por `release_api.*` que você não reconheça.

## Usar

O agente `plfcore-release` (`.claude/agents/plfcore-release.md`) faz a esteira inteira: sobe o número de versão, roda os gates, compila o instalador, publica por estas rotas e confere em `/api/v1/app/version` que entrou no ar.
