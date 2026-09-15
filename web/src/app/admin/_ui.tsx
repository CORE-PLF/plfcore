import Link from 'next/link'
import type { ReactNode } from 'react'
import { maskHwid, type LicenseDisplayState } from '@/lib/licensing'

// Helpers compartilhados das páginas do painel (server-safe, sem hooks).

export type SP = Record<string, string | string[] | undefined>

export function spStr(sp: SP, key: string): string {
  const v = sp[key]
  return typeof v === 'string' ? v : ''
}

export const PER_PAGE = 30

export function pageOf(sp: SP): number {
  const n = Number(spStr(sp, 'p'))
  return Number.isInteger(n) && n > 1 ? n : 1
}

export function fmtDate(d: Date | null | undefined): string {
  return d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
}

export function centsToInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',')
}

const TONES: Record<string, 'ok' | 'danger' | 'warn' | 'muted'> = {
  PAID: 'ok', ACTIVE: 'ok', APPROVED: 'ok', DONE: 'ok', SENT: 'ok', RESOLVED: 'ok', ATIVA: 'ok',
  REFUNDED: 'danger', CHARGEBACK: 'danger', REVOKED: 'danger', BLOCKED: 'danger',
  REJECTED: 'danger', FAILED: 'danger', DEAD: 'danger', DELETED: 'danger', DECLINED: 'danger', URGENT: 'danger',
  REVOGADA: 'danger', BLOQUEADA: 'danger',
  SUSPENDED: 'warn', EXPIRED: 'warn', OPEN: 'warn', AWAITING_SUPPORT: 'warn',
  IN_REVIEW: 'warn', REQUESTED: 'warn', HIGH: 'warn', PARTIALLY_REFUNDED: 'warn', RUNNING: 'warn',
  CONSUMIDA_OUTRA_INSTALACAO: 'warn', EXPIRADA: 'warn', SUSPENSA: 'warn',
}

// Rótulos pt-BR do estado DERIVADO da licença (licenseDisplayState).
export const STATE_LABELS: Record<LicenseDisplayState, string> = {
  SEM_ATIVACAO: 'SEM ATIVAÇÃO',
  ATIVA: 'ATIVA',
  CONSUMIDA_OUTRA_INSTALACAO: 'CONSUMIDA — OUTRA INSTALAÇÃO',
  EXPIRADA: 'EXPIRADA',
  SUSPENSA: 'SUSPENSA',
  REVOGADA: 'REVOGADA',
  BLOQUEADA: 'BLOQUEADA',
  SUBSTITUIDA: 'SUBSTITUÍDA',
}

// HWID bruto NUNCA vai à tela — mascara qualquer chave "hwid" em JSON exibido
// (meta de eventos, before/after de auditoria), inclusive registros antigos.
export function maskJsonHwid(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(maskJsonHwid)
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [
        k,
        k.toLowerCase() === 'hwid' && typeof val === 'string' ? maskHwid(val) : maskJsonHwid(val),
      ]),
    )
  return v
}

export function toneFor(status: string): 'ok' | 'danger' | 'warn' | 'muted' {
  return TONES[status] ?? 'muted'
}

export function Flash({ sp }: { sp: SP }) {
  const ok = spStr(sp, 'ok')
  const erro = spStr(sp, 'erro')
  if (!ok && !erro) return null
  return (
    <p
      className="type-mono mb-4 px-3 py-2 text-[12px]"
      style={{ boxShadow: `inset 0 0 0 1px ${erro ? 'var(--color-signal)' : 'var(--color-edge)'}` }}
      role="status"
    >
      {erro ? <span className="text-signal">[ERRO] {erro}</span> : <span className="text-ink-1">[OK] {ok}</span>}
    </p>
  )
}

export function PageTitle({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="type-kicker">{kicker}</p>
        <h1 className="type-display mt-1 text-3xl">{title}</h1>
      </div>
      {children}
    </header>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto" style={{ boxShadow: 'inset 0 0 0 1px var(--color-line)' }}>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-line">
            {head.map((h) => (
              <th key={h} className="type-kicker whitespace-nowrap px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="type-mono text-[12px] text-ink-2">{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap border-b border-line px-3 py-2 align-top ${className}`}>{children}</td>
}

export function SearchForm({
  path,
  sp,
  placeholder = 'BUSCAR',
  children,
}: {
  path: string
  sp: SP
  placeholder?: string
  children?: ReactNode
}) {
  return (
    <form action={path} method="get" className="mb-4 flex flex-wrap items-center gap-2">
      <input
        name="q"
        defaultValue={spStr(sp, 'q')}
        placeholder={placeholder}
        className="field max-w-xs"
        aria-label="Buscar"
      />
      {children}
      <button type="submit" className="btn btn--ghost btn--sm chamfer">
        FILTRAR
      </button>
    </form>
  )
}

export function Pager({ path, sp, page, hasMore }: { path: string; sp: SP; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null
  const href = (p: number) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(sp))
      if (typeof v === 'string' && v && k !== 'p' && k !== 'ok' && k !== 'erro') params.set(k, v)
    if (p > 1) params.set('p', String(p))
    const s = params.toString()
    return s ? `${path}?${s}` : path
  }
  return (
    <nav className="type-mono mt-4 flex items-center gap-3 text-[12px]" aria-label="Paginação">
      {page > 1 ? (
        <Link className="btn btn--ghost btn--sm chamfer" href={href(page - 1)}>
          ANTERIOR
        </Link>
      ) : null}
      <span className="text-ink-3">PÁGINA {page}</span>
      {hasMore ? (
        <Link className="btn btn--ghost btn--sm chamfer" href={href(page + 1)}>
          PRÓXIMA
        </Link>
      ) : null}
    </nav>
  )
}

export function ReasonInput({ placeholder = 'Motivo (obrigatório)' }: { placeholder?: string }) {
  return (
    <input
      name="reason"
      required
      minLength={4}
      maxLength={500}
      placeholder={placeholder}
      aria-label="Motivo"
      className="field"
    />
  )
}

// Zona destrutiva: etapa de confirmação explícita (abrir + motivo + botão), com hazard.
export function DangerZone({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="hazard" style={{ boxShadow: 'inset 0 0 0 1px var(--color-rust)' }}>
      <summary className="type-kicker cursor-pointer px-3 py-2 text-signal">{summary}</summary>
      <div className="space-y-2 px-3 pb-3">{children}</div>
    </details>
  )
}
