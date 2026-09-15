# BANCO DE DADOS — RESYNC WEB

Fonte da verdade: `prisma/schema.prisma`. Este documento é o mapa dos modelos principais e das convenções — não substitui o schema.

## Diagrama (modelos principais)

```mermaid
erDiagram
  User ||--o{ Order : "faz"
  User ||--o{ License : "possui"
  User ||--o| Affiliate : "pode ser"
  User ||--o| Reseller : "pode ser"

  Product ||--o{ Plan : ""
  Plan ||--o{ Price : "por moeda"
  Plan ||--o{ Order : ""

  Order ||--o{ Payment : ""
  Payment ||--o{ PaymentEvent : "webhooks"
  Order ||--o| License : "gera"
  Order ||--o| Commission : "origina"

  License ||--o{ LicenseDevice : "HWID"
  Reseller ||--o{ License : "emite"

  Affiliate ||--o{ Commission : "recebe"
  Reseller ||--o{ ResellerLedger : "movimentos"

  User {
    string id PK
    string email UK
    string staffRole "NONE|SUPPORT|ADMIN|SUPERADMIN"
    string discordId UK "opcional"
    string totpSecret "2FA, opcional"
  }
  Plan {
    string slug UK
    int durationDays "null = vitalicio"
    int deviceLimit
  }
  Price {
    string currency "BRL"
    int amountCents
  }
  Order {
    string status "PENDING..PAID..REFUNDED"
    int subtotalCents
    int discountCents
    int totalCents
  }
  Payment {
    string provider "sandbox|mercadopago"
    string providerPaymentId
    string method "PIX|CARD|BOLETO|..."
    string status "PENDING|APPROVED|..."
    int amountCents
  }
  PaymentEvent {
    string eventId "unico por provedor"
    boolean signatureValid
    datetime processedAt
  }
  License {
    string keyHash UK "lookup"
    string keyCiphertext "AES-GCM, painel"
    string keyMasked "listagens"
    string status "ACTIVE|EXPIRED|REVOKED..."
    datetime expiresAt "null = vitalicia"
    int deviceLimit
  }
  LicenseDevice {
    string hwid "unico por licenca"
    datetime lastSeenAt
    datetime revokedAt
  }
  Affiliate {
    string code UK
    int commissionBps "1500 = 15%"
    int windowDays
  }
  Commission {
    int amountCents
    string status "PENDING|APPROVED|PAID"
    datetime approvesAt "pos janela de reembolso"
  }
  Reseller {
    int discountBps
    int creditBalanceCents "cache do ledger"
  }
  ResellerLedger {
    string type "CREDIT_PURCHASE|LICENSE_ISSUE|..."
    int deltaCents "positivo entra, negativo sai"
    int balanceAfter
  }
  Job {
    string type
    string status "PENDING|RUNNING|DONE|FAILED|DEAD"
    int attempts
    datetime runAt
  }
  AuditLog {
    string actorUserId
    string action
    string entity
    json before
    json after
    string reason
  }
```

Fora do diagrama (papéis de apoio): `Session`/`OauthAccount`/`EmailToken` (identidade), `Coupon`/`CouponRedemption` (descontos), `AppVersion`/`Download` (instaladores), `SupportTicket`/`SupportMessage`, `Notification`, `DiscordDelivery`/`WebhookDelivery` (registro de entregas), `Setting`/`FeatureFlag`, `LegalAcceptance`, `AffiliateClick`/`AffiliateAttribution`.

## Convenções

- **Datas em UTC** no banco (default do Prisma). Exibição sempre com `toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })`.
- **Dinheiro em centavos inteiros** (`Int`). Percentuais em basis points (1500 = 15%). Nunca float.
- **Ledger é a fonte da verdade** do saldo de revenda: `Reseller.creditBalanceCents` é cache, atualizado na MESMA transação que grava o `ResellerLedger`. Divergência = bug, e o ledger ganha.
- **Idempotência de webhook**: `PaymentEvent` tem `@@unique([provider, eventId])` — o retry do provedor cai em conflito e não reprocessa.
- **Chave de licença nunca em claro**: `keyHash` para lookup, `keyCiphertext` (AES-GCM) para exibição ao dono, `keyMasked` para listagens.
- **Pedido tem 1 item** (simplificação declarada da v1) — sem tabela `order_items`; o plano está no próprio `Order`.
- **Soft-state por status**, não deleção: pedidos, licenças e usuários mudam de status (`REVOKED`, `SUSPENDED`, `DELETED`) e mantêm histórico.
