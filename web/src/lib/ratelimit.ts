import { db } from './db'

// Rate limit persistente (janela fixa) no MySQL — vale para N réplicas no
// Coolify, sem depender de Map em memória nem de Redis (REDIS_URL reservada).
// Incremento atômico: INSERT ... ON DUPLICATE KEY UPDATE reinicia a janela
// vencida na própria query; sem corrida entre ler e gravar.
// Falha de banco = fail-open com log: se o MySQL caiu, o request quebra
// adiante de qualquer forma — negar aqui só mascararia o erro real.

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date()
  const resetAt = new Date(now.getTime() + windowMs)
  try {
    await db.$executeRaw`
      INSERT INTO RateLimitBucket (\`key\`, \`count\`, \`resetAt\`) VALUES (${key}, 1, ${resetAt})
      ON DUPLICATE KEY UPDATE
        \`count\` = IF(\`resetAt\` <= ${now}, 1, \`count\` + 1),
        \`resetAt\` = IF(\`resetAt\` <= ${now}, ${resetAt}, \`resetAt\`)`
    const rows = await db.$queryRaw<{ count: number }[]>`
      SELECT \`count\` FROM RateLimitBucket WHERE \`key\` = ${key}`
    return Number(rows[0]?.count ?? 0) <= limit
  } catch (err) {
    console.error('ratelimit indisponível (fail-open):', err instanceof Error ? err.message : err)
    return true
  }
}

// Leitura SEM incremento — para gates que só contam falha (ex.: trava de login
// por conta). Quem incrementa é o ramo de erro, via rateLimit().
export async function rateLimitPeek(key: string, limit: number): Promise<boolean> {
  try {
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      SELECT \`count\`, \`resetAt\` FROM RateLimitBucket WHERE \`key\` = ${key}`
    const row = rows[0]
    if (!row || new Date(row.resetAt) <= new Date()) return true
    return Number(row.count) < limit
  } catch (err) {
    console.error('ratelimit peek indisponível (fail-open):', err instanceof Error ? err.message : err)
    return true
  }
}

// Sweep do worker: janela vencida há mais de 1h não serve para nada.
export async function cleanupRateLimitBuckets(): Promise<number> {
  const cutoff = new Date(Date.now() - 3600_000)
  const res = await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: cutoff } } })
  return res.count
}
