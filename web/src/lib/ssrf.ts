import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Proteção SSRF para URLs fornecidas por usuário (webhook de revenda):
// só https, nunca IP privado/loopback/link-local/metadata — nem por DNS.

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

// [base, bits]: 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16 (metadata),
// 172.16/12, 192.168/16, 198.18/15 (benchmark)
const PRIVATE_V4: Array<[number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0a80000, 16],
  [0xc6120000, 15],
]

function isPrivateV4(n: number): boolean {
  return PRIVATE_V4.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits))
}

function v6Groups(ip: string): number[] | null {
  let s = ip
  if (s.includes('.')) {
    const i = s.lastIndexOf(':')
    const v4 = ipv4ToInt(s.slice(i + 1))
    if (v4 === null) return null
    s = `${s.slice(0, i + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':').map((g) => parseInt(g, 16)) : []
  const tail = halves[1] ? halves[1].split(':').map((g) => parseInt(g, 16)) : []
  const groups =
    halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail] : head
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null
  return groups
}

function isPrivateV6(g: number[]): boolean {
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff)
    return isPrivateV4(g[6] * 65536 + g[7]) // ::ffff:mapeado — vale a regra do IPv4
  if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true // :: e ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 (ULA)
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 (link-local)
  return false
}

export function isPrivateAddress(ip: string): boolean {
  const clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const v4 = ipv4ToInt(clean)
  if (v4 !== null) return isPrivateV4(v4)
  const g = v6Groups(clean)
  if (!g) return true // não parseou como IP — fail-closed
  return isPrivateV6(g)
}

export async function assertPublicHttpsUrl(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('URL inválida. Informe a URL completa, ex.: https://seusite.com/webhook.')
  }
  if (parsed.protocol !== 'https:')
    throw new Error('A URL do webhook precisa começar com https://. Ajuste o endereço e salve de novo.')
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || (isIP(host) !== 0 && isPrivateAddress(host)))
    throw new Error('Endereço local ou de rede privada não é aceito no webhook. Use um domínio público com HTTPS.')
  if (isIP(host) === 0) {
    let addrs: Array<{ address: string }>
    try {
      addrs = await lookup(host, { all: true })
    } catch {
      throw new Error(`O domínio ${host} não resolveu. Confira a URL e tente de novo.`)
    }
    if (addrs.some((a) => isPrivateAddress(a.address)))
      throw new Error('O domínio do webhook aponta para um endereço de rede privada. Use um domínio público.')
  }
}
