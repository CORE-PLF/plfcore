import { z } from 'zod'

// Valida no boot — variável crítica faltando derruba com mensagem clara,
// não com erro críptico no meio de um pagamento.
const schema = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET precisa de >= 16 caracteres'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY precisa de >= 32 caracteres'),
  PAYMENT_PROVIDER: z.enum(['sandbox', 'mercadopago']).default('sandbox'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(1, 'PAYMENT_WEBHOOK_SECRET é obrigatória'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().default(''),
  // se definida, o webhook confere que o pagamento pertence a esta conta recebedora
  MERCADOPAGO_COLLECTOR_ID: z.string().optional().default(''),
  // reservada — rate limit e fila persistem no MySQL; Redis é opcional futuro
  REDIS_URL: z.string().optional().default(''),
  // volume persistente onde o instalador fica (servido só por rota autenticada)
  INSTALLERS_DIR: z.string().default('/data/installers'),
  DISCORD_CLIENT_ID: z.string().optional().default(''),
  DISCORD_CLIENT_SECRET: z.string().optional().default(''),
  DISCORD_BOT_TOKEN: z.string().optional().default(''),
  DISCORD_GUILD_ID: z.string().optional().default(''),
  DISCORD_PUBLIC_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('Resync <no-reply@localhost>'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const faltando = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')
  throw new Error(`Configuração inválida — corrija o .env:\n  ${faltando}`)
}

export const env = parsed.data
export const discordConfigured = () => Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET)
export const smtpConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER)
