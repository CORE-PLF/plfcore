# GO-LIVE — CHECKLIST VERIFICÁVEL

Rodar o fluxo comercial completo, de verdade, no domínio de produção, antes de divulgar. Cada item tem um resultado observável — "deve funcionar" não conta. Complementa `web/docs/CHECKLIST-PRODUCAO.md` (segredos, integrações e infra item a item).

## Fluxo comercial de ponta a ponta (com dinheiro real)

Pré-requisito: `PAYMENT_PROVIDER=mercadopago`, webhook cadastrado, worker no ar.

- [ ] **Criar conta** no site com um e-mail seu (não `@resync.dev`) — conta criada, login funciona
- [ ] **Comprar** o plano mais barato pagando um **PIX real de valor baixo** — QR gerado, pagamento concluído no app do banco
- [ ] **Webhook confirma**: em `/admin`, o evento de pagamento aparece processado sem erro; pedido vira `PAID` sem nenhuma ação manual
- [ ] **Key no painel sem depender de e-mail**: a licença aparece em PAINEL → LICENÇAS imediatamente após o webhook (o e-mail é cortesia, não pré-requisito)
- [ ] **Download**: baixar o `ResyncSetup.exe` pelo site e conferir que o SHA-256 do arquivo baixado bate com o publicado
- [ ] **Ativar no app**: instalar, ativar com a chave — ativação aceita, dispositivo registrado
- [ ] **Validar/heartbeat**: app aberto mantém a licença válida (heartbeat visível no painel/admin)
- [ ] **Suspensão bloqueia**: suspender a licença no `/admin` (com `reason`) → o app perde a validação; reativar → volta
- [ ] **Reembolso real pelo admin**: reembolsar a compra de teste → pedido `REFUNDED`, licença revogada, app deixa de validar

## Segurança

- [ ] **TOTP obrigatório em TODO o staff** — nenhuma conta `/admin` sem 2FA ativo
- [ ] **Segredos únicos** — `AUTH_SECRET`, `ENCRYPTION_KEY` e `PAYMENT_WEBHOOK_SECRET` gerados para este ambiente, nunca reaproveitados de dev/staging, nunca os placeholders de build
- [ ] **Backup da `ENCRYPTION_KEY` fora do servidor** — testado que dá para ler o valor de onde foi guardado
- [ ] **Backups do MySQL testados** — restaurar um backup em banco descartável e conferir que os dados voltam (backup que nunca restaurou não é backup)
- [ ] **Seed nunca rodou neste banco** — zero contas `@resync.dev`

## Operação

- [ ] **Worker no ar** — serviço rodando, fila esvaziando (jobs saem de `PENDING`)
- [ ] **Monitoramento do `/admin` como rotina** — webhooks com erro (assinatura inválida, falha de processamento) e jobs `DEAD`. Fila crescendo ou `DEAD` acumulando = worker parado ou integração quebrada: investigar, não limpar
- [ ] `/api/health` e `/api/ready` respondendo `200` no domínio real; healthcheck do container verde
