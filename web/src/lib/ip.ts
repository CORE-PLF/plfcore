import { headers } from 'next/headers'

// IP real atrás de proxy. O PRIMEIRO elemento do x-forwarded-for é escolhido
// pelo cliente (os proxies só acrescentam ao fim) — confiar nele torna todo
// rate limit por IP falsificável. Ordem: cf-connecting-ip (gravado pelo
// Cloudflare, não forjável de fora) → último elemento do XFF (escrito pelo
// nosso proxy) → null.
export function realIp(h: { get(name: string): string | null }): string | null {
  const cf = h.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  const parts = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : null
}

export async function clientIp(): Promise<string> {
  return realIp(await headers()) ?? 'local'
}
