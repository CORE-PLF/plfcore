# CHECKLIST DE PRODUÇÃO — RESYNC WEB

Passar por TODOS os itens antes de aceitar dinheiro de verdade. O passo a passo de cada item está em `../../deploy/COOLIFY.md`; as variáveis, em `../../deploy/ENV-PRODUCTION.md`; a verificação do fluxo comercial de ponta a ponta (compra real, suspensão, reembolso), em `../../deploy/GO-LIVE-CHECKLIST.md`.

## Segredos

- [ ] `AUTH_SECRET` forte e único, gerado com `openssl rand -base64 32` (nunca o placeholder de build, nunca reaproveitado de outro ambiente)
- [ ] `ENCRYPTION_KEY` forte, gerada com `openssl rand -base64 24` — e com **backup guardado fora do servidor** (perder = licenças ilegíveis)
- [ ] `PAYMENT_WEBHOOK_SECRET` = assinatura secreta configurada no painel do Mercado Pago
- [ ] Nenhum segredo commitado no repositório (`.env` fora do Git; conferir histórico)

## Pagamentos

- [ ] `PAYMENT_PROVIDER=mercadopago` (sandbox foi só para o teste)
- [ ] `MERCADOPAGO_ACCESS_TOKEN` de **produção** (não o de teste)
- [ ] Webhook cadastrado no Mercado Pago: `${APP_URL}/api/webhooks/payments?provider=mercadopago`
- [ ] Teste de compra REAL de baixo valor concluído: pago → licença emitida → e-mail entregue

## Integrações

- [ ] Discord configurado por completo (client id/secret, bot no servidor, public key, redirect OAuth, interactions endpoint, slash command registrado) — **ou** claramente desativado (variáveis vazias; login Discord some do site)
- [ ] SMTP configurado e testado (e-mail de entrega chega na caixa de entrada, não no spam — SPF/DKIM do domínio remetente ok)

## Banco e dados

- [ ] Migrations aplicadas via release command (`npx prisma migrate deploy`) — e configuradas para NUNCA rodar em réplicas simultâneas
- [ ] Backups do MySQL agendados no Coolify (diário no mínimo, retenção definida, destino externo/S3)
- [ ] Restauração testada pelo menos uma vez (backup que nunca restaurou não é backup)
- [ ] Seed de desenvolvimento **NUNCA** rodado neste banco (zero contas `@resync.dev`)

## Acesso

- [ ] Superadmin criado com `npm run admin:create`, senha forte e única
- [ ] 2FA (TOTP) ativado no superadmin
- [ ] Nenhuma conta de staff além das necessárias

## Infra

- [ ] Domínio apontado e HTTPS ativo pelo proxy do Coolify (certificado válido, `APP_URL` idêntica ao domínio)
- [ ] Serviço do worker no ar (`npm run worker`) apontando para o mesmo banco
- [ ] `/api/health` respondendo e healthcheck do container verde

## Pós-lançamento

- [ ] Rotina de monitorar `/admin`: webhooks com erro (assinatura inválida, falha de processamento) e jobs `DEAD`
- [ ] Alarme mental: fila crescendo ou `DEAD` acumulando = worker parado ou integração quebrada — investigar, não limpar
